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
    var creado: Date = .now
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
    @State private var enviados = 0       // dispara el háptico al enviar
    @State private var respondidos = 0    // y al terminar la respuesta

    private var base: String { sesion.ruta + "/agentes/\(agente.id.uuidString.lowercased())" }

    var body: some View {
        ScrollViewReader { lector in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if mensajes.count <= 1 { portada }
                    ForEach(Array(mensajes.enumerated()), id: \.element.id) { i, m in
                        if i == 0 || m.creado.timeIntervalSince(mensajes[i - 1].creado) > 3600 {
                            Text(Formato.momento(m.creado)).font(.caption).foregroundStyle(Color.tinta3).frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        fila(m)
                    }
                    if escribiendo { ActividadViva(pasos: pasosVivos, haciendo: haciendo ?? pensamiento) }
                    Color.clear.frame(height: 1).id("fin")
                }
                .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            // Un mensaje nuevo baja con animación; el texto que va llegando en stream, sin ella (si no, se pelean).
            .onChange(of: mensajes.count) { withAnimation(.snappy) { lector.scrollTo("fin", anchor: .bottom) } }
            .onChange(of: mensajes) { if escribiendo { lector.scrollTo("fin", anchor: .bottom) } }
            .onChange(of: pasosVivos) { lector.scrollTo("fin", anchor: .bottom) }
            .onChange(of: escribiendo) { lector.scrollTo("fin", anchor: .bottom) }
        }
        .background(Color.fondo)
        .sensoryFeedback(.impact(weight: .light), trigger: enviados)
        .sensoryFeedback(.success, trigger: respondidos)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            GlassEffectContainer(spacing: 10) {
                VStack(spacing: 10) {
                    if mensajes.count <= 1 && agente.conCerebro && !escribiendo {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(SUGERENCIAS, id: \.self) { s in
                                    Button(s) { Task { await enviar(s) } }
                                        .font(.subheadline).foregroundStyle(Color.tinta)
                                        .padding(.horizontal, 14).padding(.vertical, 9)
                                        .glassEffect(.regular.interactive())
                                }
                            }
                            .padding(.horizontal, 14)
                        }
                    }
                    Compositor(nombre: agente.nombre, ocupado: escribiendo) { texto, ruta in Task { await enviar(texto, ruta: ruta) } }
                }
            }
            .padding(.bottom, 6)
        }
        .navigationTitle(agente.nombre)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)  // dentro de un hilo no hay pestañas, como en Mensajes de iOS
        .toolbar {
            ToolbarItem(placement: .principal) {
                // La píldora con avatar y nombre, como la cabecera de Grok Bot; tocarla abre la ficha.
                Button { ficha = true } label: {
                    HStack(spacing: 8) {
                        AvatarAgente(nombre: agente.nombre, avatar: agente.avatar, tamano: 26, trabajando: escribiendo)
                        Text(agente.nombre).font(.subheadline.weight(.semibold)).foregroundStyle(Color.tinta)
                        if escribiendo { ProgressView().controlSize(.mini) }
                    }
                    .padding(.leading, 6).padding(.trailing, 12).frame(height: 40)
                    .glassEffect(.regular.interactive(), in: .capsule)
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

    /// La portada del agente cuando el hilo empieza: quién es y para qué está, como una ficha de contacto.
    private var portada: some View {
        VStack(spacing: 10) {
            AvatarAgente(nombre: agente.nombre, avatar: agente.avatar, tamano: 92, trabajando: escribiendo)
            Text(agente.nombre).font(.editorial(30)).foregroundStyle(Color.tinta)
            if let t = agente.trabajo {
                Text(t).font(.subheadline).foregroundStyle(Color.tinta2).multilineTextAlignment(.center).frame(maxWidth: 300)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 28).padding(.bottom, 12)
    }

    // MARK: filas

    @ViewBuilder private func fila(_ m: MensajeHilo) -> some View {
        if m.de == "yo" {
            // El dueño: burbuja de tinta a la derecha, como en Grok Bot.
            VStack(alignment: .trailing, spacing: 3) {
                Text(m.texto).font(.body).foregroundStyle(Color.sobreFirme)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Color.firme, in: .rect(cornerRadius: 18))
                if let nota = m.nota { Text(nota).font(.caption).foregroundStyle(Color.tinta3) }
            }
            .frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 56)
        } else if let p = m.propuesta {
            // Una acción que pide visto bueno: burbuja gris con tarjeta blanca dentro, como el «New email» de Grok Bot.
            VStack(alignment: .leading, spacing: 10) {
                Text("Pide su visto bueno").font(.footnote.weight(.medium)).foregroundStyle(Color.tinta2)
                VStack(alignment: .leading, spacing: 6) {
                    Text(p.resumen).font(.body).foregroundStyle(Color.tinta)
                    if let d = p.detalle { Text(d).font(.subheadline).foregroundStyle(Color.tinta2) }
                }
                .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.panel, in: .rect(cornerRadius: 12))
                if let r = m.resuelta {
                    Text(r == "aprobada" ? "Aprobado" : "Rechazado").font(.footnote.weight(.medium)).foregroundStyle(Color.tinta2)
                } else {
                    HStack(spacing: 8) {
                        Button { Task { await decidir(m, "aprobar") } } label: { Text("Aprobar").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).frame(height: 40) }
                            .buttonStyle(.borderedProminent).tint(Color.firme)
                        Button { Task { await decidir(m, "rechazar") } } label: { Text("Rechazar").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).frame(height: 40) }
                            .buttonStyle(.bordered).tint(Color.tinta)
                    }
                }
            }
            .padding(12)
            .background(Color.panel2, in: .rect(cornerRadius: 18))
            .padding(.trailing, 40)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                if let pasos = m.pasos, !pasos.isEmpty { PasosHechos(pasos: pasos) }
                // El agente: una burbuja gris por párrafo, como en Grok Bot.
                ForEach(Array(parrafos(m.texto).enumerated()), id: \.offset) { _, t in
                    Text(LocalizedStringKey(t)).font(.body).foregroundStyle(Color.tinta).textSelection(.enabled)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Color.panel2, in: .rect(cornerRadius: 18))
                }
                if let ops = m.opciones {
                    VStack(spacing: 6) {
                        ForEach(ops, id: \.letra) { o in
                            Button { Task { await elegir(m, o) } } label: {
                                HStack(spacing: 12) {
                                    Text(o.letra).font(.cifra(.subheadline)).frame(width: 22)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(o.titulo).font(.subheadline.weight(.semibold))
                                        Text(o.detalle).font(.caption).opacity(0.7)
                                    }
                                    Spacer()
                                }
                                .padding(12)
                                .background(m.elegida == o.letra ? Color.firme : Color.panel2, in: .rect(cornerRadius: 14))
                                .foregroundStyle(m.elegida == o.letra ? Color.sobreFirme : Color.tinta)
                            }
                            .disabled(m.elegida != nil)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 40)
        }
    }

    private func parrafos(_ t: String) -> [String] {
        let partes = t.components(separatedBy: "\n\n").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return partes.isEmpty ? (t.isEmpty ? [] : [t]) : partes
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
        mensajes = h.map { .init(id: $0.id, de: $0.de == "yo" ? "yo" : "agente", texto: $0.texto, pasos: $0.pasos, creado: API.decodificador.dateDecodingStrategy.fecha($0.creado) ?? .now) }
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
        enviados += 1
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
            @MainActor func poner(_ texto: String, anexar: Bool) {
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
            if creada { respondidos += 1 }
            if Task.isCancelled { return }
            if !termino { await reengancharse() }
            else if await trabajando() { seguir() }  // había mensajes formados: ya arrancó el siguiente
        }
    }
}

/// Los pasos que dio, en una sola línea plegada; abierta, agrupa las herramientas repetidas.
struct PasosHechos: View {
    var pasos: [Paso]
    @State private var abierto = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { withAnimation(.snappy) { abierto.toggle() } } label: {
                HStack(spacing: 6) {
                    Text(Pasos.resumen(pasos)).font(.footnote).foregroundStyle(Color.tinta3)
                    Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).rotationEffect(.degrees(abierto ? 180 : 0)).foregroundStyle(Color.tinta3)
                }
            }
            if abierto {
                ForEach(Pasos.agrupar(pasos)) { g in
                    HStack(spacing: 8) {
                        Cuadrado(color: g.fallos > 0 ? .critico : .bueno, lado: 5)
                        Text(g.veces > 1 ? "\(g.titulo) ×\(g.veces)" : g.titulo).font(.footnote).foregroundStyle(Color.tinta2)
                        if let d = g.detalle { Text(d).font(.footnote).foregroundStyle(Color.tinta3).lineLimit(1) }
                        Spacer(minLength: 4)
                        Text(Formato.duracion(g.ms)).font(.footnote.monospacedDigit()).foregroundStyle(Color.tinta3)
                    }
                }
                .padding(.leading, 2)
            }
        }
    }
}

/// Lo que hace ahora mismo: una sola línea quieta con el paso en curso y cuántos lleva.
struct ActividadViva: View {
    var pasos: [Paso]
    var haciendo: String?
    @State private var abierto = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { withAnimation(.snappy) { abierto.toggle() } } label: {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text((haciendo ?? "Pensando").capitalizedFirst).font(.footnote).foregroundStyle(Color.tinta2).lineLimit(1)
                    if pasos.count > 1 {
                        Text("· \(pasos.count) pasos").font(.footnote).foregroundStyle(Color.tinta3)
                        Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).rotationEffect(.degrees(abierto ? 180 : 0)).foregroundStyle(Color.tinta3)
                    }
                }
            }
            .disabled(pasos.count <= 1)
            if abierto {
                ForEach(Pasos.agrupar(pasos)) { g in
                    HStack(spacing: 8) {
                        Cuadrado(color: g.fallos > 0 ? .critico : .bueno, lado: 5)
                        Text(g.veces > 1 ? "\(g.titulo) ×\(g.veces)" : g.titulo).font(.footnote).foregroundStyle(Color.tinta2)
                        Spacer(minLength: 4)
                        Text(Formato.duracion(g.ms)).font(.footnote.monospacedDigit()).foregroundStyle(Color.tinta3)
                    }
                }
                .padding(.leading, 2)
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

nonisolated enum Pasos {
    struct Grupo: Identifiable { var id: Int; var titulo: String; var detalle: String?; var veces: Int; var ms: Int; var fallos: Int }

    /// Pasos consecutivos con la misma herramienta se cuentan una vez: «Usó el navegador ×12 · 4.2 min».
    static func agrupar(_ pasos: [Paso]) -> [Grupo] {
        var salida: [Grupo] = []
        for p in pasos {
            let titulo = Herramientas.describir(p.herramienta).hizo
            if var u = salida.last, u.titulo == titulo {
                u.veces += 1; u.ms += p.ms ?? 0; u.fallos += (p.ok == false ? 1 : 0); u.detalle = nil
                salida[salida.count - 1] = u
            } else {
                salida.append(Grupo(id: salida.count, titulo: titulo, detalle: (p.detalle?.isEmpty ?? true) ? nil : p.detalle, veces: 1, ms: p.ms ?? 0, fallos: p.ok == false ? 1 : 0))
            }
        }
        return salida
    }

    static func resumen(_ pasos: [Paso]) -> String {
        let grupos = agrupar(pasos)
        let ms = pasos.compactMap(\.ms).reduce(0, +)
        if grupos.count == 1, let g = grupos.first {
            return (g.veces > 1 ? "\(g.titulo) ×\(g.veces)" : g.titulo) + (ms > 0 ? " · \(Formato.duracion(ms))" : "")
        }
        return "\(pasos.count) pasos" + (ms > 0 ? " en \(Formato.duracion(ms))" : "")
    }
}

nonisolated extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}

nonisolated extension Formato {
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

/// El compositor, como en Grok Bot: «+» a la izquierda (nivel del modelo; adjuntos después), campo en píldora,
/// flecha solo cuando hay algo que enviar.
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
        let vacio = texto.trimmingCharacters(in: .whitespaces).isEmpty
        HStack(alignment: .bottom, spacing: 8) {
            Menu {
                Section("Nivel para este mensaje") {
                    Button { nivel = nil } label: { Label("Automático", systemImage: nivel == nil ? "checkmark" : "") }
                    ForEach(Self.niveles, id: \.0) { n in Button { nivel = n.0 } label: { Label { Text(n.1); Text(n.2) } icon: { Image(systemName: nivel == n.0 ? "checkmark" : "") } } }
                }
            } label: {
                Image(systemName: "plus").font(.body.weight(.medium)).foregroundStyle(Color.tinta).frame(width: 44, height: 44)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .accessibilityLabel("Opciones del mensaje")
            HStack(alignment: .bottom, spacing: 4) {
                TextField("Mensaje a \(nombre)", text: $texto, axis: .vertical)
                    .lineLimit(1...6).font(.body).focused($foco)
                    .padding(.leading, 16).padding(.vertical, 12)
                    .submitLabel(.send)
                if nivel != nil {
                    Text(Self.niveles.first { $0.0 == nivel }?.1 ?? "").font(.caption.weight(.medium)).foregroundStyle(Color.tinta2).padding(.bottom, 14)
                }
                Button {
                    let t = texto; texto = ""; enviar(t, nivel); nivel = nil
                } label: {
                    Image(systemName: "arrow.up").font(.body.weight(.bold)).frame(width: 34, height: 34)
                        .foregroundStyle(Color.sobreFirme)
                        .background(Color.firme, in: .circle)
                }
                .disabled(vacio)
                .opacity(vacio ? 0 : 1)
                .scaleEffect(vacio ? 0.6 : 1)
                .animation(.snappy, value: vacio)
                .padding(5)
                .accessibilityLabel("Enviar")
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 24))
        }
        .padding(.horizontal, 10)
    }
}
