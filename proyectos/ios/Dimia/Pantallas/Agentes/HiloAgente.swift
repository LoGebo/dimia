import SwiftUI

/// Un mensaje del hilo con el agente. El agente nuevo se presenta y ofrece opciones; el agente con
/// trabajo contesta desde su máquina, en stream, con los pasos que dio y las acciones que pide aprobar.
struct MensajeHilo: Identifiable, Equatable {
    struct Opcion: Equatable { var letra: String; var titulo: String; var detalle: String; var nombre: String?; var trabajo: String? }
    struct Propuesta: Equatable { var run_id: String; var request_id: String?; var resumen: String; var detalle: String? }
    var id: Int
    var de: String  // "yo" | "agente"
    var texto: String
    var nota: String? = nil
    var opciones: [Opcion]? = nil
    var elegida: String? = nil
    var pasos: [Paso]? = nil
    var propuesta: Propuesta? = nil
    var resuelta: String? = nil
}

private let ROLES: [MensajeHilo.Opcion] = [
    .init(letra: "A", titulo: "Cotizar con proveedores", detalle: "Buscar, pedir precios, comparar", nombre: "Cotizador", trabajo: "Busca proveedores, pide precios y los anota en Clientes."),
    .init(letra: "B", titulo: "Cobrar", detalle: "Recordar pagos y registrar lo que entra", nombre: "Cobranza", trabajo: "Recuerda pagos pendientes por WhatsApp y registra lo que entra."),
    .init(letra: "C", titulo: "Dar seguimiento", detalle: "Escribir a quien no ha vuelto", nombre: "Seguimiento", trabajo: "Escribe a quien no ha vuelto y le ofrece cita."),
    .init(letra: "D", titulo: "Otra cosa", detalle: "Dígamelo con sus palabras"),
]

private let ACCION: [String: String] = [
    "agendar_cita": "agendar una cita", "cancelar_cita": "cancelar una cita", "anotar_recado": "dejarle un recado", "registrar_pago": "registrar un pago",
    "enviar_whatsapp": "mandar un WhatsApp", "gmail_enviar": "enviar un correo", "calendar_crear": "crear un evento en su calendario", "notion_agregar": "escribir en Notion",
    "slack_publicar": "publicar en Slack", "github_crear_issue": "abrir un issue en GitHub", "github_crear_pr": "abrir un pull request en GitHub",
]

private let SUGERENCIAS = ["¿Cómo va el día?", "¿Quién no ha vuelto en 90 días?", "¿Cuánto cobré esta semana?", "¿Qué citas hay mañana?"]

struct HiloAgente: View {
    @Environment(Sesion.self) private var sesion
    @Environment(\.scenePhase) private var fase
    @State var agente: Agente
    var cerebroConectado: Bool
    var cambiado: (Agente) -> Void
    var borrado: () -> Void

    @State private var mensajes: [MensajeHilo] = []
    @State private var escribiendo = false
    @State private var haciendo: String?
    @State private var pensamiento: String?
    @State private var pasosVivos: [Paso] = []
    @State private var esperaTrabajo = false   // eligió «Otra cosa»: la siguiente frase es su trabajo
    @State private var ficha = false
    @State private var tareaStream: Task<Void, Never>?

    private var base: String { sesion.ruta + "/agentes/\(agente.id.uuidString.lowercased())" }

    var body: some View {
        ScrollViewReader { lector in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(mensajes) { m in
                        fila(m)
                    }
                    if escribiendo { actividad }
                    Color.clear.frame(height: 1).id("fin")
                }
                .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: mensajes) { withAnimation { lector.scrollTo("fin", anchor: .bottom) } }
            .onChange(of: pasosVivos) { lector.scrollTo("fin", anchor: .bottom) }
        }
        .background(Color.fondo)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 8) {
                if mensajes.count <= 1 && agente.conCerebro && !escribiendo {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(SUGERENCIAS, id: \.self) { s in
                                Button(s) { Task { await enviar(s) } }
                                    .font(.footnote).buttonStyle(.bordered).buttonBorderShape(.capsule)
                            }
                        }
                        .padding(.horizontal, 14)
                    }
                }
                Compositor(nombre: agente.nombre, ocupado: escribiendo) { texto, ruta in Task { await enviar(texto, ruta: ruta) } }
            }
            .padding(.bottom, 6)
        }
        .navigationTitle(agente.nombre)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button { ficha = true } label: {
                    HStack(spacing: 8) {
                        AvatarAgente(nombre: agente.nombre, avatar: agente.avatar, tamano: 28, trabajando: escribiendo)
                        VStack(spacing: 0) {
                            Text(agente.nombre).font(.subheadline.weight(.semibold)).foregroundStyle(Color.tinta)
                            Text(escribiendo ? (haciendo ?? "trabajando…") : agente.activo ? "activo" : "en pausa").font(.caption2).foregroundStyle(Color.tinta3).lineLimit(1)
                        }
                    }
                }
                .accessibilityLabel("Ajustes de \(agente.nombre)")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Hilo nuevo", systemImage: "plus.bubble") { Task { await hiloNuevo() } }
                    Button("Ajustes del agente", systemImage: "slider.horizontal.3") { ficha = true }
                } label: { Image(systemName: "ellipsis") }
                .accessibilityLabel("Más")
            }
        }
        .sheet(isPresented: $ficha) {
            FichaAgente(agente: agente) { nuevo in agente = nuevo; cambiado(nuevo) } borrado: { borrado() }
        }
        .task(id: agente.id) { await cargar() }
        .onChange(of: fase) { if fase == .active && !escribiendo { Task { await reengancharse() } } }
        .onDisappear { tareaStream?.cancel() }
    }

    // MARK: filas

    @ViewBuilder private func fila(_ m: MensajeHilo) -> some View {
        if m.de == "yo" {
            VStack(alignment: .trailing, spacing: 3) {
                Text(m.texto).font(.body).foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Color.acento).clipShape(.rect(cornerRadius: 18))
                if let nota = m.nota { Text(nota).font(.caption2).foregroundStyle(Color.tinta3) }
            }
            .frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 48)
        } else if let p = m.propuesta {
            Tarjeta {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) { Cuadrado(color: .alerta); Text("Pide su visto bueno").font(.caption.weight(.semibold)).foregroundStyle(Color.tinta3) }
                    Text(p.resumen).font(.subheadline.weight(.semibold)).foregroundStyle(Color.tinta)
                    if let d = p.detalle { Text(d).font(.footnote).foregroundStyle(Color.tinta2) }
                    if let r = m.resuelta {
                        Estampa(texto: r == "aprobada" ? "Aprobado" : "Rechazado", tono: r == "aprobada" ? .bueno : .tinta3)
                    } else {
                        HStack(spacing: 8) {
                            Button("Aprobar") { Task { await decidir(m, "aprobar") } }.buttonStyle(.borderedProminent).buttonBorderShape(.roundedRectangle(radius: 0))
                            Button("Rechazar") { Task { await decidir(m, "rechazar") } }.buttonStyle(.bordered).buttonBorderShape(.roundedRectangle(radius: 0))
                        }
                    }
                }
                .padding(14)
            }
            .padding(.trailing, 24)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                if let pasos = m.pasos, !pasos.isEmpty { PasosHechos(pasos: pasos) }
                if !m.texto.isEmpty {
                    Text(LocalizedStringKey(m.texto)).font(.body).foregroundStyle(Color.tinta).textSelection(.enabled)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Color.panel2).clipShape(.rect(cornerRadius: 18))
                }
                if let ops = m.opciones {
                    VStack(spacing: 6) {
                        ForEach(ops, id: \.letra) { o in
                            Button { Task { await elegir(m, o) } } label: {
                                HStack(spacing: 12) {
                                    Text(o.letra).font(.cifra(.subheadline)).foregroundStyle(m.elegida == o.letra ? .white : Color.acento).frame(width: 22)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(o.titulo).font(.subheadline.weight(.semibold))
                                        Text(o.detalle).font(.caption).foregroundStyle(m.elegida == o.letra ? .white.opacity(0.8) : Color.tinta3)
                                    }
                                    Spacer()
                                }
                                .padding(12)
                                .background(m.elegida == o.letra ? Color.acento : Color.panel)
                                .foregroundStyle(m.elegida == o.letra ? .white : Color.tinta)
                                .overlay(Rectangle().stroke(Color.linea, lineWidth: m.elegida == o.letra ? 0 : 1))
                            }
                            .disabled(m.elegida != nil)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 32)
        }
    }

    /// Lo que está haciendo ahora, con sus pasos: quieto y discreto, como Grok Bot.
    private var actividad: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(pasosVivos) { p in FilaPaso(paso: p) }
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text(haciendo ?? pensamiento ?? "Pensando…").font(.footnote).foregroundStyle(Color.tinta3).lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: datos

    private func saludo() -> MensajeHilo {
        if agente.recepcion { return .init(id: 1, de: "agente", texto: "Soy Recepción, de \(sesion.negocio?.nombre ?? "su negocio"). Pregúnteme por citas, clientes o cobros, o pídame agendar, cancelar o anotar; antes de hacerlo le pido su visto bueno.") }
        if !agente.conCerebro { return .init(id: 1, de: "agente", texto: "Hola. Mucho gusto.\n¿Para qué me quiere más?", opciones: ROLES) }
        return .init(id: 1, de: "agente", texto: "Soy \(agente.nombre). \(agente.trabajo ?? "")")
    }

    private func cargar() async {
        mensajes = [saludo()]
        guard agente.conCerebro else { return }
        await historial()
        if await trabajando() { seguir() }
    }

    private func historial() async {
        guard let h: [MensajeAgente] = try? await API.obtener(base + "/mensajes"), !h.isEmpty else { return }
        mensajes = h.map { .init(id: $0.id, de: $0.de == "yo" ? "yo" : "agente", texto: $0.texto, pasos: $0.pasos) }
    }

    private func trabajando() async -> Bool {
        (try? await API.obtener(base + "/estado", como: [String: Bool].self))?["trabajando"] ?? false
    }

    private func reengancharse() async {
        guard agente.conCerebro else { return }
        if await trabajando() { seguir() } else { await historial() }
    }

    private func hiloNuevo() async {
        if agente.conCerebro { try? await API.enviar("POST", base + "/hilo-nuevo") }
        mensajes = [saludo()]
    }

    private func decidir(_ m: MensajeHilo, _ decision: String) async {
        guard let p = m.propuesta else { return }
        do {
            try await API.enviar("POST", base + "/aprobacion", ["run_id": p.run_id, "request_id": p.request_id ?? "", "decision": decision])
            if let i = mensajes.firstIndex(where: { $0.id == m.id }) { mensajes[i].resuelta = decision == "aprobar" ? "aprobada" : "rechazada" }
        } catch {
            mensajes.append(.init(id: Int(Date.now.timeIntervalSince1970 * 1000), de: "agente", texto: "No pude registrar su decisión: \(error.localizedDescription)"))
        }
    }

    private func elegir(_ m: MensajeHilo, _ o: MensajeHilo.Opcion) async {
        if let i = mensajes.firstIndex(where: { $0.id == m.id }) { mensajes[i].elegida = o.letra }
        let ahora = Int(Date.now.timeIntervalSince1970 * 1000)
        mensajes.append(.init(id: ahora, de: "yo", texto: o.titulo))
        guard let trabajo = o.trabajo, let nombre = o.nombre else {
            esperaTrabajo = true
            mensajes.append(.init(id: ahora + 1, de: "agente", texto: "Va. Dígamelo en una frase: ¿qué quiere que haga?"))
            return
        }
        await bautizar(nombre: nombre, trabajo: trabajo)
    }

    private func bautizar(nombre: String?, trabajo: String) async {
        do {
            let a: Agente = try await API.enviar("PATCH", base, AgenteCambios(nombre: nombre, trabajo: trabajo, estado: "activo"))
            agente = a; cambiado(a)
            mensajes.append(.init(id: Int(Date.now.timeIntervalSince1970 * 1000) + 2, de: "agente", texto: "Listo. Soy \(a.nombre): \(trabajo)\nCuando quiera, deme la primera tarea."))
        } catch {
            mensajes.append(.init(id: Int(Date.now.timeIntervalSince1970 * 1000) + 2, de: "agente", texto: "No pude guardarlo: \(error.localizedDescription)"))
        }
    }

    // MARK: enviar y leer el stream

    private func enviar(_ texto: String, ruta: String? = nil) async {
        let t = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        let id = Int(Date.now.timeIntervalSince1970 * 1000)
        if esperaTrabajo {
            esperaTrabajo = false
            mensajes.append(.init(id: id, de: "yo", texto: t))
            await bautizar(nombre: nil, trabajo: String(t.prefix(200)))
            return
        }
        guard agente.conCerebro else {
            mensajes.append(contentsOf: [.init(id: id, de: "yo", texto: t), .init(id: id + 1, de: "agente", texto: "Primero dígame para qué me quiere, con una de las opciones de arriba.")])
            return
        }
        mensajes.append(.init(id: id, de: "yo", texto: t))
        var cuerpo: [String: String] = ["texto": t]
        if let ruta { cuerpo["ruta"] = ruta }
        leer(API.stream("POST", base + "/turno", cuerpo: cuerpo), idMio: id)
    }

    private func seguir() { leer(API.stream("GET", base + "/turno/seguir"), idMio: nil) }

    private func leer(_ eventos: AsyncThrowingStream<Evento, Error>, idMio: Int?) {
        tareaStream?.cancel()
        escribiendo = true
        tareaStream = Task {
            let idAgente = Int(Date.now.timeIntervalSince1970 * 1000) + 7
            var creada = false
            var termino = false
            func poner(_ texto: String, anexar: Bool) {
                if !creada { creada = true; mensajes.append(.init(id: idAgente, de: "agente", texto: texto)); return }
                if let i = mensajes.firstIndex(where: { $0.id == idAgente }) { mensajes[i].texto = anexar ? mensajes[i].texto + texto : texto }
            }
            do {
                for try await e in eventos {
                    if Task.isCancelled { break }
                    switch e.evento {
                    case "texto": haciendo = nil; pensamiento = nil; poner(e.texto ?? "", anexar: true)
                    case "herramienta":
                        pensamiento = nil
                        haciendo = Herramientas.describir(e.texto ?? "").haciendo
                        pasosVivos.append(Paso(herramienta: e.texto ?? "", detalle: e.detalle))
                    case "herramienta_fin":
                        if let i = pasosVivos.firstIndex(where: { $0.herramienta == e.texto && $0.ms == nil }) { pasosVivos[i].ms = e.ms ?? 0; pasosVivos[i].ok = e.ok ?? true }
                        haciendo = nil
                    case "pensando": pensamiento = e.texto
                    case "guiado", "en_cola":
                        if let i = mensajes.lastIndex(where: { $0.de == "yo" }) { mensajes[i].nota = e.evento == "guiado" ? "Se lo pasé mientras trabaja" : "Sale en cuanto termine" }
                    case "aprobacion":
                        haciendo = nil
                        let que = ACCION[e.texto ?? ""] ?? (e.texto ?? "una acción").replacingOccurrences(of: #"^mcp__[a-z_]+?__"#, with: "", options: .regularExpression).replacingOccurrences(of: "_", with: " ")
                        mensajes.append(.init(id: Int(Date.now.timeIntervalSince1970 * 1000) + 3, de: "agente", texto: "", propuesta: .init(run_id: e.run_id ?? "", request_id: e.request_id, resumen: "\(agente.nombre) quiere \(que).", detalle: e.detalle)))
                    case "sin_codex", "error", "cuota": poner(e.texto ?? "Algo falló.", anexar: false); termino = true
                    case "fin": termino = true
                    default:
                        if let modo = e.modo, let idMio, let i = mensajes.firstIndex(where: { $0.id == idMio }) {
                            mensajes[i].nota = modo == "guiado" ? "Se lo pasé mientras trabaja" : "Sale en cuanto termine"
                            termino = true
                        }
                    }
                }
            } catch {
                // Se cortó el stream (la app se fue al fondo, se fue la red): el agente sigue en su máquina.
            }
            haciendo = nil; pensamiento = nil
            if !pasosVivos.isEmpty, let i = mensajes.firstIndex(where: { $0.id == idAgente }) { mensajes[i].pasos = pasosVivos }
            pasosVivos = []
            escribiendo = false
            if Task.isCancelled { return }
            if !termino { await reengancharse() }
            else if await trabajando() { seguir() }  // había mensajes formados: ya arrancó el siguiente
        }
    }
}

/// Los pasos que dio, plegados; como el «Ran full suite · 212 passed» de Grok Bot.
struct PasosHechos: View {
    var pasos: [Paso]
    @State private var abierto = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { withAnimation(.snappy) { abierto.toggle() } } label: {
                HStack(spacing: 6) {
                    Text(resumen).font(.caption).foregroundStyle(Color.tinta3)
                    Image(systemName: "chevron.down").font(.caption2).rotationEffect(.degrees(abierto ? 180 : 0)).foregroundStyle(Color.tinta3)
                }
            }
            if abierto { ForEach(pasos) { FilaPaso(paso: $0) } }
        }
    }
    private var resumen: String {
        let grupos = Array(NSOrderedSet(array: pasos.map { Herramientas.describir($0.herramienta).hizo })) as? [String] ?? []
        let ms = pasos.compactMap(\.ms).reduce(0, +)
        return grupos.prefix(3).joined(separator: " · ") + (grupos.count > 3 ? " · +\(grupos.count - 3)" : "") + (ms > 0 ? " · \(Formato.duracion(ms))" : "")
    }
}

struct FilaPaso: View {
    var paso: Paso
    var body: some View {
        HStack(spacing: 8) {
            Cuadrado(color: paso.ms == nil ? .acento : (paso.ok ?? true) ? .bueno : .critico, lado: 5)
            Text(paso.ms == nil ? Herramientas.describir(paso.herramienta).haciendo.capitalizedFirst : Herramientas.describir(paso.herramienta).hizo).font(.caption).foregroundStyle(Color.tinta2)
            if let d = paso.detalle, !d.isEmpty { Text(d).font(.caption).foregroundStyle(Color.tinta3).lineLimit(1) }
            Spacer(minLength: 4)
            if let ms = paso.ms { Text(Formato.duracion(ms)).font(.caption.monospacedDigit()).foregroundStyle(Color.tinta3) }
        }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

extension Formato {
    static func duracion(_ ms: Int) -> String { ms < 1000 ? "\(ms) ms" : ms < 60_000 ? String(format: "%.1f s", Double(ms) / 1000) : "\(ms / 60_000) min" }
}

/// Herramienta → cómo se le dice al dueño (mismo diccionario que actividad-agente.tsx).
nonisolated enum Herramientas {
    private static let tabla: [(String, String, String)] = [
        ("^mcp__dimia__(citas|disponibilidad|buscar_cita)$", "revisando la agenda", "Revisó la agenda"),
        ("^mcp__dimia__(buscar_cliente|clientes_sin_volver)$", "buscando clientes", "Buscó clientes"),
        ("^mcp__dimia__cobros$", "revisando los cobros", "Revisó los cobros"),
        ("^mcp__dimia__servicios$", "consultando los servicios", "Consultó los servicios"),
        ("^mcp__dimia__(consultar|esquema)$", "consultando los datos del negocio", "Consultó los datos del negocio"),
        ("^mcp__dimia__agendar_cita$", "agendando una cita", "Agendó una cita"),
        ("^mcp__dimia__cancelar_cita$", "cancelando una cita", "Canceló una cita"),
        ("^mcp__dimia__anotar_recado$", "dejando un recado", "Dejó un recado"),
        ("^mcp__dimia__registrar_pago$", "registrando un pago", "Registró un pago"),
        ("^mcp__whatsapp__", "mandando un WhatsApp", "Mandó un WhatsApp"),
        ("^mcp__google__gmail_enviar$", "enviando un correo", "Envió un correo"),
        ("^mcp__google__gmail_", "leyendo el correo", "Leyó el correo"),
        ("^mcp__google__calendar_", "revisando el calendario", "Revisó el calendario"),
        ("^mcp__google__drive_", "buscando en Drive", "Buscó en Drive"),
        ("^mcp__notion__", "revisando Notion", "Revisó Notion"),
        ("^mcp__slack__publicar", "publicando en Slack", "Publicó en Slack"),
        ("^mcp__slack__", "leyendo Slack", "Leyó Slack"),
        ("^mcp__github__crear_", "escribiendo en GitHub", "Escribió en GitHub"),
        ("^mcp__github__", "leyendo el repositorio", "Leyó el repositorio"),
        ("^mcp__navegador_rapido__|^browser_navigate$", "navegando en internet", "Navegó en internet"),
        ("^browser_", "usando el navegador", "Usó el navegador"),
        ("^web_search$", "buscando en internet", "Buscó en internet"),
        ("^web_extract$", "leyendo una página", "Leyó una página"),
        ("^terminal$", "corriendo un comando", "Corrió un comando"),
        ("^(read_file|search_files|list_dir)$", "leyendo archivos", "Leyó archivos"),
        ("^(write_file|patch|edit_file|create_file)$", "escribiendo un archivo", "Escribió un archivo"),
        ("^computer_use", "usando la computadora", "Usó la computadora"),
        ("^execute_code|^code_execution", "corriendo código", "Corrió código"),
        ("^cronjob", "ajustando una rutina", "Ajustó una rutina"),
        ("^skill", "consultando una habilidad", "Consultó una habilidad"),
    ]
    static func describir(_ h: String) -> (haciendo: String, hizo: String) {
        for (re, haciendo, hizo) in tabla where h.range(of: re, options: .regularExpression) != nil { return (haciendo, hizo) }
        let limpio = h.replacingOccurrences(of: #"^mcp__[a-z_]+?__"#, with: "", options: .regularExpression).replacingOccurrences(of: "_", with: " ")
        return ("usando \(limpio)", "Usó \(limpio)")
    }
}

/// El compositor: campo redondo, botón de enviar y el nivel del modelo para ese mensaje.
struct Compositor: View {
    var nombre: String
    var ocupado: Bool
    var enviar: (String, String?) -> Void
    @State private var texto = ""
    @State private var nivel: String? = nil
    @FocusState private var foco: Bool

    private static let niveles: [(String, String, String)] = [
        ("ligero", "Ligero", "Saludos y respuestas sin consultar nada."),
        ("rapido", "Rápido", "Preguntas cortas con una consulta."),
        ("fuerte", "A fondo", "Tareas de varios pasos: navegar, redactar, enviar."),
        ("profundo", "Profundo", "Investigación y planeación. Tarda y gasta más."),
    ]

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Menu {
                Button("Automático") { nivel = nil }
                ForEach(Self.niveles, id: \.0) { n in Button { nivel = n.0 } label: { Text(n.1); Text(n.2) } }
            } label: {
                Image(systemName: nivel == nil ? "sparkles" : "gauge.with.needle").font(.body).frame(width: 40, height: 40)
            }
            .accessibilityLabel("Nivel del modelo")
            HStack(alignment: .bottom, spacing: 6) {
                TextField("Mensaje a \(nombre)", text: $texto, axis: .vertical)
                    .lineLimit(1...6).font(.body).focused($foco)
                    .padding(.leading, 14).padding(.vertical, 10)
                    .submitLabel(.send)
                Button {
                    let t = texto; texto = ""; enviar(t, nivel); nivel = nil
                } label: {
                    Image(systemName: "arrow.up").font(.body.weight(.bold)).frame(width: 32, height: 32)
                        .background(texto.trimmingCharacters(in: .whitespaces).isEmpty ? Color.tinta3 : Color.acento).foregroundStyle(.white).clipShape(.circle)
                }
                .disabled(texto.trimmingCharacters(in: .whitespaces).isEmpty)
                .padding(4)
                .accessibilityLabel("Enviar")
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 22))
        }
        .padding(.horizontal, 10)
    }
}
