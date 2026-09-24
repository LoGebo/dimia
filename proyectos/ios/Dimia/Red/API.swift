import Foundation

/// El cliente de la API. Pone el token, refresca cuando expira y decodifica fechas ISO con fracciones.
nonisolated final class API: Sendable {
    /// Las pruebas de UI la cambian con el argumento `-api <url>`; si no, producción.
    static let base = UserDefaults.standard.string(forKey: "api").flatMap { $0.isEmpty ? nil : URL(string: $0) } ?? URL(string: "https://dimia-api.fly.dev")!

    nonisolated(unsafe) static var tokens: Tokens? {
        didSet {
            if let t = tokens { Llavero.guardar(t.access, clave: "access"); Llavero.guardar(t.refresh, clave: "refresh") }
            else {
                Llavero.borrar("access"); Llavero.borrar("refresh")
                // `tokens` no es observable: sin esto la app se quedaría en las pestañas con «Su sesión terminó».
                Task { @MainActor in Notificaciones.sesion?.yo = nil }
            }
        }
    }

    static func cargarTokens() {
        if let a = Llavero.leer("access"), let r = Llavero.leer("refresh") { tokens = Tokens(access: a, refresh: r, expira_seg: 0) }
    }

    static let decodificador: JSONDecoder = {
        let d = JSONDecoder()
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let simple = ISO8601DateFormatter()
        d.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            if let f = iso.date(from: s) ?? simple.date(from: s) { return f }
            throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath, debugDescription: "fecha inválida \(s)"))
        }
        return d
    }()

    enum Fallo: Error, LocalizedError {
        case http(Int, String)
        case sinSesion
        var errorDescription: String? {
            switch self {
            case .http(let c, let d):
                if d.isEmpty { return c >= 500 ? "El servicio no respondió. Intente de nuevo en un momento." : "No se pudo completar. Revise los datos e intente de nuevo." }
                // La API manda «correo o contraseña incorrectos»: se muestra como frase.
                let frase = d.prefix(1).uppercased() + d.dropFirst()
                return frase.hasSuffix(".") ? frase : frase + "."
            case .sinSesion: return "Su sesión terminó. Vuelva a entrar."
            }
        }
    }

    static func peticion(_ metodo: String, _ ruta: String, cuerpo: (some Encodable)? = Optional<String>.none, conToken: Bool = true) throws -> URLRequest {
        // `appending(path:)` codificaría el «?»: la consulta se separa a mano.
        let partes = ruta.split(separator: "?", maxSplits: 1).map(String.init)
        var url = base.appending(path: partes[0])
        if partes.count == 2 { url.append(queryItems: partes[1].split(separator: "&").map { par in
            let kv = par.split(separator: "=", maxSplits: 1).map(String.init)
            return URLQueryItem(name: kv[0], value: kv.count == 2 ? kv[1] : nil)
        }) }
        var r = URLRequest(url: url)
        r.httpMethod = metodo
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if conToken {
            guard let t = tokens else { throw Fallo.sinSesion }
            r.setValue("Bearer \(t.access)", forHTTPHeaderField: "Authorization")
        }
        if let cuerpo { r.httpBody = try JSONEncoder().encode(cuerpo) }
        return r
    }

    /// Una llamada con reintento tras refrescar el token si vino 401.
    static func llamar(_ metodo: String, _ ruta: String, cuerpo: (some Encodable)? = Optional<String>.none, conToken: Bool = true) async throws -> Data {
        let (datos, resp) = try await URLSession.shared.data(for: peticion(metodo, ruta, cuerpo: cuerpo, conToken: conToken))
        let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if codigo == 401, conToken {
            // El access expiró: se refresca una vez y se reintenta. Si el refresh no sirve, la sesión terminó.
            guard try await refrescar() else { throw Fallo.sinSesion }
            let (d2, r2) = try await URLSession.shared.data(for: peticion(metodo, ruta, cuerpo: cuerpo, conToken: conToken))
            return try revisar(d2, (r2 as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return try revisar(datos, codigo)
    }

    static func revisar(_ datos: Data, _ codigo: Int) throws -> Data {
        guard (200..<300).contains(codigo) else {
            let e = try? decodificador.decode(ErrorApi.self, from: datos)
            throw Fallo.http(codigo, e?.detalle ?? "")
        }
        return datos
    }

    static func obtener<T: Decodable>(_ ruta: String, como: T.Type = T.self) async throws -> T {
        try decodificador.decode(T.self, from: await llamar("GET", ruta))
    }

    static func enviar<T: Decodable>(_ metodo: String, _ ruta: String, _ cuerpo: (some Encodable)? = Optional<String>.none, como: T.Type = T.self) async throws -> T {
        try decodificador.decode(T.self, from: await llamar(metodo, ruta, cuerpo: cuerpo))
    }

    static func enviar(_ metodo: String, _ ruta: String, _ cuerpo: (some Encodable)? = Optional<String>.none) async throws {
        _ = try await llamar(metodo, ruta, cuerpo: cuerpo)
    }

    /// false (y sin tokens) solo si la API rechaza el refresh; una falla de red o un 5xx se lanza y la sesión sigue.
    /// Sin candado: el refresh no se rota en el servidor, así que dos refrescos a la vez no se estorban.
    static func refrescar() async throws -> Bool {
        guard let t = tokens else { return false }
        let r = try peticion("POST", "/v1/acceso/refrescar", cuerpo: ["refresh": t.refresh], conToken: false)
        let (d, resp) = try await URLSession.shared.data(for: r)
        let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if codigo == 401 || codigo == 403 { tokens = nil; return false }
        tokens = try decodificador.decode(Tokens.self, from: revisar(d, codigo))
        return true
    }

    static func entrar(email: String, password: String) async throws {
        let d = try await llamar("POST", "/v1/acceso/entrar", cuerpo: ["email": email, "password": password], conToken: false)
        tokens = try decodificador.decode(Tokens.self, from: d)
    }

    /// Lee un stream SSE (`data: {...}` por evento). Termina cuando el servidor cierra o el consumidor cancela.
    static func stream(_ metodo: String, _ ruta: String, cuerpo: (some Encodable)? = Optional<String>.none) -> AsyncThrowingStream<Evento, Error> {
        // La petición se arma aquí (fuera del closure) para que el stream no capture nada no-Sendable.
        let peticionLista: Result<URLRequest, Error> = Result { var r = try peticion(metodo, ruta, cuerpo: cuerpo); r.timeoutInterval = 60 * 30; return r }
        return AsyncThrowingStream { cont in
            let tarea = Task {
                do {
                    var r = try peticionLista.get()
                    var (bytes, resp) = try await URLSession.shared.bytes(for: r)
                    var codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
                    if codigo == 401 {
                        // El access expiró: igual que llamar(), se refresca una vez y se reintenta con el token nuevo.
                        guard try await refrescar(), let t = tokens else { throw Fallo.sinSesion }
                        r.setValue("Bearer \(t.access)", forHTTPHeaderField: "Authorization")
                        (bytes, resp) = try await URLSession.shared.bytes(for: r)
                        codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
                    }
                    if codigo == 204 { cont.finish(); return }
                    guard codigo == 200 else { cont.yield(Evento(evento: "error", texto: codigo == 409 ? "Todavía estoy con su mensaje anterior; deme un momento." : "No pude hablar con mi máquina. Intente de nuevo en un momento.")); cont.finish(); return }
                    for try await linea in bytes.lines {
                        guard linea.hasPrefix("data:") else { continue }
                        let json = linea.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if let e = try? decodificador.decode(Evento.self, from: Data(json.utf8)) { cont.yield(e) }
                    }
                    cont.finish()
                } catch {
                    cont.finish(throwing: error)
                }
            }
            cont.onTermination = { _ in tarea.cancel() }
        }
    }
}

extension JSONDecoder.DateDecodingStrategy {
    /// Parsea una fecha ISO suelta (con o sin fracciones) con el mismo criterio que el decodificador.
    nonisolated func fecha(_ s: String) -> Date? {
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }
}

nonisolated enum SSE {
    /// Separa un cuerpo SSE en sus eventos; lo usa la prueba unitaria (el stream real va línea por línea).
    static func eventos(_ texto: String) -> [Evento] {
        texto.components(separatedBy: "\n\n").compactMap { bloque in
            guard let linea = bloque.split(separator: "\n").first(where: { $0.hasPrefix("data:") }) else { return nil }
            return try? API.decodificador.decode(Evento.self, from: Data(linea.dropFirst(5).trimmingCharacters(in: .whitespaces).utf8))
        }
    }
}
