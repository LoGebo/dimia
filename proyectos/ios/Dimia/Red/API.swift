import Foundation

/// El cliente de la API. Pone el token, refresca cuando expira y decodifica fechas ISO con fracciones.
nonisolated final class API: Sendable {
    static let base = URL(string: "https://dimia-api.fly.dev")!

    nonisolated(unsafe) static var tokens: Tokens? {
        didSet {
            if let t = tokens { Llavero.guardar(t.access, clave: "access"); Llavero.guardar(t.refresh, clave: "refresh") }
            else { Llavero.borrar("access"); Llavero.borrar("refresh") }
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
            case .http(let c, let d): return d.isEmpty ? "La API respondió \(c)." : d
            case .sinSesion: return "Su sesión terminó. Vuelva a entrar."
            }
        }
    }

    static func peticion(_ metodo: String, _ ruta: String, cuerpo: (some Encodable)? = Optional<String>.none, conToken: Bool = true) throws -> URLRequest {
        var r = URLRequest(url: base.appending(path: ruta))
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
            guard await refrescar() else { tokens = nil; throw Fallo.sinSesion }
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

    private static let candadoRefresco = NSLock()

    static func refrescar() async -> Bool {
        guard let t = tokens else { return false }
        do {
            let r = try peticion("POST", "/v1/acceso/refrescar", cuerpo: ["refresh": t.refresh], conToken: false)
            let (d, resp) = try await URLSession.shared.data(for: r)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { tokens = nil; return false }
            tokens = try decodificador.decode(Tokens.self, from: d)
            return true
        } catch { return false }
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
                    let r = try peticionLista.get()
                    let (bytes, resp) = try await URLSession.shared.bytes(for: r)
                    let codigo = (resp as? HTTPURLResponse)?.statusCode ?? 0
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

nonisolated enum SSE {
    /// Separa un cuerpo SSE en sus eventos; lo usa la prueba unitaria (el stream real va línea por línea).
    static func eventos(_ texto: String) -> [Evento] {
        texto.components(separatedBy: "\n\n").compactMap { bloque in
            guard let linea = bloque.split(separator: "\n").first(where: { $0.hasPrefix("data:") }) else { return nil }
            return try? API.decodificador.decode(Evento.self, from: Data(linea.dropFirst(5).trimmingCharacters(in: .whitespaces).utf8))
        }
    }
}
