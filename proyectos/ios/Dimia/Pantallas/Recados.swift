import SwiftUI

/// Los recados que dejó el agente: quién llamó, qué quería y a qué número regresarle. Un toque y queda atendido.
struct RecadosPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var recados: [Recado] = []
    @State private var todos = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { FilaError(texto: error) { Task { await cargar() } }.listRowBackground(Color.fondo).listRowSeparator(.hidden) }
                if recados.isEmpty && error == nil {
                    Vacio(titulo: todos ? "No hay recados." : "Nadie espera que le marque.", detalle: "Cuando el agente no puede resolver algo, deja aquí el recado con el número.")
                        .listRowBackground(Color.fondo).listRowSeparator(.hidden)
                }
                ForEach(recados) { r in
                    FilaRecado(recado: r, zona: sesion.negocio?.zona_horaria ?? "America/Mexico_City") { Task { await alternar(r) } }
                        .listRowBackground(Color.fondo).listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                        .swipeActions(edge: .leading) { Button(r.atendido ? "Pendiente" : "Atendido", systemImage: r.atendido ? "arrow.uturn.backward" : "checkmark") { Task { await alternar(r) } }.tint(.bueno) }
                }
            }
            .listStyle(.plain).scrollContentBackground(.hidden).background(Color.fondo)
            .navigationTitle("Recados")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("Ver", selection: $todos) { Text("Pendientes").tag(false); Text("Todos").tag(true) }.pickerStyle(.menu)
                }
                BotonAjustes()
            }
            .refreshable { await cargar() }
            .task(id: "\(sesion.negocio?.id.uuidString ?? "")-\(todos)") { await cargar() }
        }
    }

    private func cargar() async {
        do { recados = try await API.obtener(sesion.ruta + "/recados?pendientes=\(todos ? "false" : "true")"); error = nil }
        catch { self.error = error.localizedDescription }
    }

    private func alternar(_ r: Recado) async {
        do {
            try await API.enviar("POST", sesion.ruta + "/recados/\(r.id.uuidString.lowercased())/atendido")
            withAnimation(.snappy) {
                if todos, let i = recados.firstIndex(where: { $0.id == r.id }) { recados[i].atendido.toggle() }
                else { recados.removeAll { $0.id == r.id } }
            }
        } catch { self.error = error.localizedDescription }
    }
}

struct FilaRecado: View {
    var recado: Recado
    var zona: String
    var alternar: () -> Void
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: alternar) {
                Image(systemName: recado.atendido ? "checkmark.square.fill" : "square").font(.title2).foregroundStyle(recado.atendido ? Color.bueno : Color.tinta3)
            }
            .buttonStyle(.plain).accessibilityLabel(recado.atendido ? "Marcar pendiente" : "Marcar atendido")
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(recado.nombre ?? Formato.telefono(recado.telefono)).font(.body.weight(.semibold)).foregroundStyle(recado.atendido ? Color.tinta3 : Color.tinta)
                    Spacer()
                    Text(Formato.cuando(recado.creado)).font(.subheadline).foregroundStyle(Color.tinta3)
                }
                Text(recado.asunto).font(.subheadline).foregroundStyle(recado.atendido ? Color.tinta3 : Color.tinta2)
                if let d = recado.detalle, !d.isEmpty { Text(d).font(.footnote).foregroundStyle(Color.tinta3).lineLimit(3) }
                if !recado.atendido, let url = URL(string: "tel:\(recado.telefono)") {
                    Link(destination: url) {
                        Label(Formato.telefono(recado.telefono), systemImage: "phone").font(.subheadline.weight(.medium))
                            .padding(.horizontal, 12).frame(height: 34).background(Color.panel2, in: .capsule).foregroundStyle(Color.tinta)
                    }
                    .padding(.top, 2)
                }
            }
        }
        .padding(14)
        .background(Color.panel, in: .rect(cornerRadius: 16))
    }
}
