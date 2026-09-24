import SwiftUI

/// La ficha del agente: quién es, qué puede hacer, sus rutinas y sus habilidades. Lo que en el
/// panel es la columna derecha; aquí es una hoja.
struct FichaAgente: View {
    @Environment(Sesion.self) private var sesion
    @Environment(\.dismiss) private var cerrar
    @State var agente: Agente
    var cambiado: (Agente) -> Void
    var borrado: () -> Void

    @State private var nombre: String
    @State private var trabajo: String
    @State private var reglas: String
    @State private var permisos: Set<String>
    @State private var rutinas: Rutinas?
    @State private var catalogo: Catalogo?
    @State private var guardando = false
    @State private var confirmarBorrado = false
    @State private var error: String?

    private static let permisosTodos = [("leer", "Leer el panel"), ("navegar", "Navegar sitios"), ("anotar", "Anotar en Clientes"), ("escribir", "Escribir a clientes"), ("agendar", "Mover citas"), ("formularios", "Llenar formularios")]

    init(agente: Agente, cambiado: @escaping (Agente) -> Void, borrado: @escaping () -> Void) {
        _agente = State(initialValue: agente)
        self.cambiado = cambiado; self.borrado = borrado
        _nombre = State(initialValue: agente.nombre)
        _trabajo = State(initialValue: agente.trabajo ?? "")
        _reglas = State(initialValue: agente.reglas ?? "")
        _permisos = State(initialValue: Set(agente.permisos))
    }

    private var base: String { sesion.ruta + "/agentes/\(agente.id.uuidString.lowercased())" }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        AvatarAgente(nombre: nombre, avatar: agente.avatar, tamano: 64)
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("Nombre", text: $nombre).font(.title3.weight(.semibold)).disabled(agente.recepcion)
                            Toggle(isOn: Binding(get: { agente.activo }, set: { v in Task { await guardar(AgenteCambios(estado: v ? "activo" : "en_pausa")) } })) {
                                Text(agente.activo ? "Activo" : "En pausa").font(.footnote).foregroundStyle(Color.tinta3)
                            }
                            .disabled(!agente.conCerebro)
                        }
                    }
                    .listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                }
                if !agente.recepcion {
                    Section("Cara") { SelectorCara(nombre: nombre, avatar: agente.avatar) { nuevo in Task { await guardar(AgenteCambios(avatar: nuevo)) } } }
                }
                Section("Trabajo") {
                    TextField("Qué hace, en una frase", text: $trabajo, axis: .vertical).lineLimit(2...4).disabled(agente.recepcion)
                    TextField("Reglas que debe respetar", text: $reglas, axis: .vertical).lineLimit(2...6)
                }
                Section("Lo que hace sin pedir permiso") {
                    ForEach(Self.permisosTodos, id: \.0) { p in
                        Toggle(p.1, isOn: Binding(get: { permisos.contains(p.0) }, set: { v in
                            if v { permisos.insert(p.0) } else { permisos.remove(p.0) }
                            Task { await guardar(AgenteCambios(permisos: Array(permisos))) }
                        }))
                    }
                }
                if agente.conCerebro {
                    Section("Rutinas") {
                        if let r = rutinas {
                            if r.rutinas.isEmpty { Text(r.estado == "sin_respuesta" ? "La computadora está apagada." : "Todavía no tiene rutinas. Pídaselas en el hilo: «cada lunes a las 9 mándame…».").font(.footnote).foregroundStyle(Color.tinta3) }
                            ForEach(r.rutinas) { FilaRutina(rutina: $0) }
                        } else { ProgressView() }
                    }
                    Section {
                        if let c = catalogo {
                            ForEach(c.skills) { sk in
                                FilaHabilidad(nombre: sk.nombre, detalle: sk.detalle, puesta: sk.agentes.contains(agente.id.uuidString.lowercased()), disponible: true) { v in Task { await instalar("skill", sk.clave, v) } }
                            }
                            ForEach(c.integraciones.filter(\.lista)) { it in
                                FilaHabilidad(nombre: it.nombre, detalle: it.cuenta.map { "Cuenta: " + $0 } ?? it.detalle, puesta: it.agentes.contains(agente.id.uuidString.lowercased()), disponible: it.cuenta != nil) { v in Task { await instalar("integracion", it.clave, v) } }
                            }
                        } else { ProgressView() }
                    } header: { Text("Habilidades") } footer: { Text("Las integraciones se conectan desde el panel web.") }
                }
                if !agente.recepcion {
                    Section { Button("Borrar este agente", role: .destructive) { confirmarBorrado = true } }
                }
                if let error { Section { Text(error).foregroundStyle(Color.critico) } }
            }
            .navigationTitle("Ajustes del agente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(guardando ? "Guardando…" : "Listo") { Task { if await guardarTexto() { cerrar() } } }.disabled(guardando)
                }
            }
            .confirmationDialog("¿Borrar a \(agente.nombre)?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("Borrar", role: .destructive) { Task { await borrar() } }
            } message: { Text("Se borra su hilo y su escritorio. No se puede deshacer.") }
            .task {
                async let r: Rutinas? = try? API.obtener(base + "/rutinas")
                async let c: Catalogo? = try? API.obtener(sesion.ruta + "/agentes-negocio/catalogo")
                rutinas = await r ?? Rutinas(estado: "sin_respuesta", rutinas: [])
                catalogo = await c ?? Catalogo(skills: [], integraciones: [])
            }
        }
    }

    /// true si guardó o no había cambios; si falló, la hoja sigue abierta con el error y el texto.
    @discardableResult private func guardarTexto() async -> Bool {
        var c = AgenteCambios()
        let n = nombre.trimmingCharacters(in: .whitespaces), t = trabajo.trimmingCharacters(in: .whitespaces)
        if n != agente.nombre, !n.isEmpty { c.nombre = n; if agente.avatar == nil { let r = Rasgos.de(nombre: agente.nombre, avatar: nil); c.avatar = "\(r.forma):\(r.color)" } }
        if t != (agente.trabajo ?? ""), !t.isEmpty { c.trabajo = t; if !agente.conCerebro { c.estado = "activo" } }
        if reglas != (agente.reglas ?? "") { c.reglas = reglas }
        if c.nombre != nil || c.trabajo != nil || c.reglas != nil { return await guardar(c) }
        return true
    }

    @discardableResult private func guardar(_ c: AgenteCambios) async -> Bool {
        guardando = true
        defer { guardando = false }
        do { let a: Agente = try await API.enviar("PATCH", base, c); agente = a; cambiado(a); error = nil; return true }
        catch { self.error = error.localizedDescription; return false }
    }

    private func instalar(_ tipo: String, _ clave: String, _ si: Bool) async {
        struct Cuerpo: Encodable { var tipo: String; var clave: String; var instalar: Bool }
        do {
            try await API.enviar("POST", base + "/instalaciones", Cuerpo(tipo: tipo, clave: clave, instalar: si))
            catalogo = try? await API.obtener(sesion.ruta + "/agentes-negocio/catalogo")
        } catch { self.error = error.localizedDescription }
    }

    private func borrar() async {
        do { try await API.enviar("DELETE", base); cerrar(); borrado() }
        catch { self.error = error.localizedDescription }
    }
}

/// Formas y colores para la cara del agente, en una tira horizontal.
private struct SelectorCara: View {
    var nombre: String
    var avatar: String?
    var elegir: (String) -> Void
    var body: some View {
        let actual = Rasgos.de(nombre: nombre, avatar: avatar)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Rasgos.formas, id: \.self) { f in
                    Button { elegir("\(f):\(actual.color)") } label: {
                        AvatarAgente(nombre: nombre, avatar: "\(f):\(actual.color)", tamano: 40)
                            .padding(4)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(actual.forma == f ? Color.acento : Color.clear, lineWidth: 2))
                    }
                }
                Divider().frame(height: 30)
                ForEach(Rasgos.colores, id: \.self) { c in
                    Button { elegir("\(actual.forma):\(c)") } label: {
                        Rectangle().fill(Color(hex: c)).frame(width: 26, height: 26)
                            .padding(4)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(actual.color == c ? Color.tinta : Color.clear, lineWidth: 2))
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

private struct FilaRutina: View {
    var rutina: Rutina
    var body: some View {
        let detalle: String = rutina.proxima == nil ? rutina.horario : rutina.horario + " · próxima " + rutina.proxima!
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Cuadrado(color: rutina.activa ? Color.bueno : Color.tinta3)
                Text(rutina.nombre).font(.subheadline.weight(.semibold))
            }
            Text(detalle).font(.caption).foregroundStyle(Color.tinta3)
        }
    }
}

private struct FilaHabilidad: View {
    var nombre: String
    var detalle: String
    var puesta: Bool
    var disponible: Bool
    var cambiar: (Bool) -> Void
    var body: some View {
        Toggle(isOn: Binding(get: { puesta }, set: cambiar)) {
            VStack(alignment: .leading, spacing: 1) {
                Text(nombre)
                Text(detalle).font(.caption).foregroundStyle(Color.tinta3)
            }
        }
        .disabled(!disponible)
    }
}
