import SwiftUI

struct AgendaPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var dia = Date()
    @State private var citas: [Cita] = []
    @State private var error: String?
    @State private var cargando = false

    private var zona: String { sesion.negocio?.zona_horaria ?? "America/Mexico_City" }
    private var calendario: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: zona) ?? .current; c.locale = Locale(identifier: "es_MX"); return c }

    var body: some View {
        NavigationStack {
            List {
                if let error { FilaError(texto: error) { Task { await cargar() } }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                let visibles = citas.filter { $0.estado != "cancelada" }
                if visibles.isEmpty && !cargando && error == nil {
                    Vacio(titulo: "Sin citas este día").listRowBackground(Color.clear)
                }
                ForEach(visibles) { c in
                    FilaCita(cita: c, zona: zona)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.panel)
                }
            }
            .listStyle(.plain)
            .background(Color.fondo)
            .scrollContentBackground(.hidden)
            .navigationTitle(Formato.fecha(dia, zona: zona, larga: true).capitalized)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { mover(-1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Día anterior")
                    Button { mover(1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Día siguiente")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Hoy") { dia = Date() }.disabled(calendario.isDateInToday(dia))
                }
                BotonAjustes()
            }
            .safeAreaInset(edge: .bottom) {
                DatePicker("Día", selection: $dia, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .environment(\.locale, Locale(identifier: "es_MX"))
                    .environment(\.timeZone, TimeZone(identifier: zona) ?? .current)
                    .padding(10)
                    .glassEffect()
                    .padding(.bottom, 8)
            }
            .refreshable { await cargar() }
            .task(id: "\(sesion.negocio?.id.uuidString ?? "")-\(diaIso)") { await cargar() }
        }
    }

    private var diaIso: String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: zona); return f.string(from: dia)
    }

    private func mover(_ n: Int) { dia = calendario.date(byAdding: .day, value: n, to: dia) ?? dia }

    private func cargar() async {
        cargando = true
        defer { cargando = false }
        do { citas = try await API.obtener(sesion.ruta + "/agenda?dia=\(diaIso)"); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
