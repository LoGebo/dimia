import SwiftUI

struct AjustesPantalla: View {
    @Environment(Sesion.self) private var sesion
    @Environment(\.dismiss) private var cerrar
    @State private var confirmarBorrado = false
    @State private var borrando = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let yo = sesion.yo, yo.negocios.count > 1 {
                    Section("Negocio") {
                        ForEach(yo.negocios) { n in
                            Button {
                                sesion.elegir(n); cerrar()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(n.nombre).foregroundStyle(Color.tinta)
                                        Text(n.vertical_nombre).font(.footnote).foregroundStyle(Color.tinta3)
                                    }
                                    Spacer()
                                    if n.id == sesion.negocio?.id { Cuadrado(color: .acento, lado: 8) }
                                }
                            }
                        }
                    }
                }
                Section("Cuenta") {
                    LabeledContent("Correo", value: sesion.yo?.email ?? "")
                    if let n = sesion.negocio { LabeledContent("Negocio", value: n.nombre) }
                    Link("Aviso de privacidad", destination: URL(string: "https://dimia.mx/aviso-de-privacidad")!)
                    Link("Panel completo en la web", destination: URL(string: "https://panel.dimia.mx")!)
                }
                Section {
                    Button("Cerrar sesión") { sesion.salir(); cerrar() }
                    Button("Eliminar mi cuenta", role: .destructive) { confirmarBorrado = true }
                        .disabled(borrando)
                } footer: {
                    Text("Eliminar la cuenta borra su usuario y sus accesos. Si es el único dueño, el negocio queda desactivado.")
                }
                if let error { Section { Text(error).foregroundStyle(Color.critico) } }
            }
            .navigationTitle("Ajustes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { cerrar() } } }
            .confirmationDialog("¿Eliminar su cuenta de Dimia?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("Eliminar la cuenta", role: .destructive) { Task { await borrar() } }
            } message: { Text("No se puede deshacer.") }
        }
    }

    private func borrar() async {
        borrando = true
        defer { borrando = false }
        do { try await sesion.borrarCuenta(); cerrar() } catch { self.error = error.localizedDescription }
    }
}
