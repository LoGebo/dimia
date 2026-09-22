import SwiftUI

/// Los pedidos del día, para comida: primero los que hay que sacar, luego los entregados y cancelados.
/// Cada pedido se mueve de estado con un toque, como en el tablero del panel.
struct PedidosPantalla: View {
    @Environment(Sesion.self) private var sesion
    @State private var dia = Date()
    @State private var pedidos: [Pedido] = []
    @State private var error: String?
    @State private var cargando = false

    private var zona: String { sesion.negocio?.zona_horaria ?? "America/Mexico_City" }
    private var calendario: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: zona) ?? .current; c.locale = Locale(identifier: "es_MX"); return c }
    private func iso(_ d: Date) -> String { let f = DateFormatter(); f.calendar = calendario; f.timeZone = calendario.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from: d) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let error { FilaError(texto: error) { Task { await cargar() } } }
                    let porSacar = pedidos.filter(\.porSacar)
                    let cerrados = pedidos.filter { !$0.porSacar }
                    resumen(porSacar: porSacar)
                    if pedidos.isEmpty && !cargando && error == nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(calendario.isDateInToday(dia) ? "Todavía no hay pedidos hoy." : "Sin pedidos este día.").font(.body).foregroundStyle(Color.tinta)
                            Text("Los que tome el agente por teléfono o WhatsApp aparecen aquí solos.").font(.subheadline).foregroundStyle(Color.tinta3)
                        }
                        .padding(20).frame(maxWidth: .infinity, alignment: .leading).background(Color.panel, in: .rect(cornerRadius: 16))
                    }
                    if !porSacar.isEmpty { grupo("Por sacar", porSacar) }
                    if !cerrados.isEmpty { grupo("Cerrados", cerrados) }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .background(Color.fondo)
            .navigationTitle(calendario.isDateInToday(dia) ? "Pedidos" : Formato.fecha(dia, zona: zona).replacingOccurrences(of: ".", with: "").capitalizedFirst)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { mover(-1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Día anterior")
                    Button { mover(1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Día siguiente")
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Hoy") { dia = Date() }.disabled(calendario.isDateInToday(dia)) }
                BotonAjustes()
            }
            .refreshable { await cargar() }
            .task(id: "\(sesion.negocio?.id.uuidString ?? "")-\(iso(dia))") { await cargar() }
            .onAppear {
                #if DEBUG
                if let d = UserDefaults.standard.string(forKey: "dia"), let f = { let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = calendario.timeZone; return f.date(from: d) }() { dia = f }
                #endif
            }
        }
    }

    private func mover(_ n: Int) { withAnimation(.snappy) { dia = calendario.date(byAdding: .day, value: n, to: dia) ?? dia } }

    private func resumen(porSacar: [Pedido]) -> some View {
        let entregados = pedidos.filter { $0.estado == "entregado" }
        let vendido = entregados.reduce(Decimal(0)) { $0 + $1.total.valor }
        return Tinta {
            HStack(alignment: .top, spacing: 0) {
                cifra("\(porSacar.count)", porSacar.count == 1 ? "por sacar" : "por sacar")
                cifra("\(entregados.count)", entregados.count == 1 ? "entregado" : "entregados")
                cifra(Formato.moneda(vendido), "vendido")
            }
            .padding(20)
        }
    }

    private func cifra(_ valor: String, _ etiqueta: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(valor).font(.editorial(30)).monospacedDigit().contentTransition(.numericText())
            Text(etiqueta).font(.footnote).opacity(0.72)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func grupo(_ titulo: String, _ lista: [Pedido]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titulo).font(.title3.weight(.semibold)).foregroundStyle(Color.tinta).padding(.horizontal, 4)
            ForEach(lista) { p in TarjetaPedido(pedido: p, zona: zona) { nuevo in Task { await cambiar(p, nuevo) } } }
        }
    }

    private func cargar() async {
        cargando = true
        defer { cargando = false }
        do { pedidos = try await API.obtener(sesion.ruta + "/pedidos?dia=\(iso(dia))"); error = nil }
        catch { self.error = error.localizedDescription }
    }

    private func cambiar(_ p: Pedido, _ estado: String) async {
        do {
            try await API.enviar("PATCH", sesion.ruta + "/pedidos/\(p.id.uuidString.lowercased())", ["estado": estado])
            if let i = pedidos.firstIndex(where: { $0.id == p.id }) { withAnimation(.snappy) { pedidos[i].estado = estado } }
        } catch { self.error = error.localizedDescription }
    }
}

/// Un pedido: código y cliente, qué lleva, cuánto es y el botón para pasarlo al siguiente estado.
struct TarjetaPedido: View {
    var pedido: Pedido
    var zona: String
    var cambiar: (String) -> Void
    @State private var abierto = false

    private var tono: Color { pedido.estado == "abierto" ? .alerta : pedido.estado == "confirmado" ? .acento : pedido.estado == "entregado" ? .bueno : .tinta3 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(pedido.codigo).font(.cifra(.body)).foregroundStyle(Color.tinta3)
                Text(pedido.nombre).font(.body.weight(.semibold)).foregroundStyle(Color.tinta).lineLimit(1)
                Spacer()
                Estampa(texto: pedido.estadoNombre, tono: tono)
            }
            HStack(spacing: 6) {
                Text(pedido.tipoNombre).font(.subheadline).foregroundStyle(Color.tinta2)
                if let d = pedido.direccion { Text("· " + d).font(.subheadline).foregroundStyle(Color.tinta3).lineLimit(1) }
                Spacer()
                if let l = pedido.listo_para { Text("listo " + Formato.hora(l, zona: zona)).font(.subheadline.monospacedDigit()).foregroundStyle(Color.tinta3) }
            }
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array((abierto ? pedido.items : Array(pedido.items.prefix(3))).enumerated()), id: \.offset) { _, it in
                    HStack(alignment: .firstTextBaseline) {
                        Text("\(it.cantidad)×").font(.subheadline.monospacedDigit()).foregroundStyle(Color.tinta3).frame(width: 30, alignment: .leading)
                        Text(it.nombre + (it.notas.map { " (\($0))" } ?? "")).font(.subheadline).foregroundStyle(Color.tinta)
                        Spacer()
                        Text(Formato.moneda(it.subtotal)).font(.subheadline.monospacedDigit()).foregroundStyle(Color.tinta2)
                    }
                }
                if pedido.items.count > 3 {
                    Button(abierto ? "Ver menos" : "y \(pedido.items.count - 3) más") { withAnimation(.snappy) { abierto.toggle() } }.font(.footnote.weight(.medium))
                }
            }
            if let n = pedido.notas, !n.isEmpty { Text(n).font(.footnote).foregroundStyle(Color.tinta3) }
            Divider()
            HStack {
                Text(Formato.moneda(pedido.total)).font(.editorial(24)).monospacedDigit().foregroundStyle(Color.tinta)
                Spacer()
                if pedido.porSacar {
                    Menu {
                        if pedido.estado == "abierto" { Button("A cocina", systemImage: "flame") { cambiar("confirmado") } }
                        Button("Entregado", systemImage: "checkmark") { cambiar("entregado") }
                        Button("Cancelar pedido", systemImage: "xmark", role: .destructive) { cambiar("cancelado") }
                    } label: {
                        Text(pedido.estado == "abierto" ? "A cocina" : "Entregado").font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16).frame(height: 38)
                            .background(Color(UIColor(hex: 0x0b0f17)), in: .capsule).foregroundStyle(Color(UIColor(hex: 0xeef1f7)))
                    } primaryAction: { cambiar(pedido.estado == "abierto" ? "confirmado" : "entregado") }
                }
                if let url = URL(string: "tel:\(pedido.telefono)") {
                    Link(destination: url) { Image(systemName: "phone").font(.body).frame(width: 38, height: 38).background(Color.panel2, in: .circle).foregroundStyle(Color.tinta) }
                        .accessibilityLabel("Llamar")
                }
            }
        }
        .padding(16)
        .background(Color.panel, in: .rect(cornerRadius: 16))
        .opacity(pedido.porSacar ? 1 : 0.75)
    }
}
