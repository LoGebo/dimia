import SwiftUI

/// Las citas de un día sobre una línea de tiempo, como Structured o el DayTicker de Fantastical:
/// hora a la izquierda, la línea con un punto por cita, la tarjeta a la derecha; los huecos largos
/// se dicen («Libre 1 h 30») y la hora actual se marca con una línea en azul.
struct LineaTiempo: View {
    var citas: [Cita]
    var zona: String
    var hoy: Bool
    var maximo: Int? = nil

    private enum Renglon: Identifiable {
        case cita(Cita), hueco(Int, Date), ahora
        var id: String {
            switch self { case .cita(let c): c.id.uuidString; case .hueco(_, let d): "h\(d.timeIntervalSince1970)"; case .ahora: "ahora" }
        }
    }

    private var renglones: [Renglon] {
        let lista = Array(citas.filter { $0.estado != "cancelada" }.prefix(maximo ?? .max))
        var salida: [Renglon] = []
        var ahoraPuesto = !hoy
        for (i, c) in lista.enumerated() {
            if !ahoraPuesto && c.inicio > .now { salida.append(.ahora); ahoraPuesto = true }
            if i > 0 {
                let hueco = Int(c.inicio.timeIntervalSince(lista[i - 1].fin) / 60)
                if hueco >= 45 { salida.append(.hueco(hueco, lista[i - 1].fin)) }
            }
            salida.append(.cita(c))
        }
        if !ahoraPuesto { salida.append(.ahora) }
        return salida
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(renglones) { r in
                switch r {
                case .cita(let c): TarjetaCita(cita: c, zona: zona)
                case .hueco(let min, _):
                    HStack(spacing: 14) {
                        Text("").frame(width: 48)
                        Rectangle().fill(Color.tinta3.opacity(0.35)).frame(width: 1.5, height: 34)
                        Text("Libre \(Formato.minutos(min))").font(.footnote).foregroundStyle(Color.tinta3)
                    }
                case .ahora:
                    HStack(spacing: 8) {
                        Text(Formato.hora(.now, zona: zona)).font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(Color.acento).frame(width: 48, alignment: .trailing)
                        Cuadrado(color: .acento, lado: 7)
                        Rectangle().fill(Color.acento).frame(height: 1.5)
                    }
                    .padding(.vertical, 8)
                }
            }
        }
    }
}

/// Una cita en la línea de tiempo: hora, punto, tarjeta con nombre, servicio y estado.
struct TarjetaCita: View {
    var cita: Cita
    var zona: String
    private var colorRecurso: Color {
        Color(hex: Rasgos.colores[1 + Int(Rasgos.hash(cita.recurso.lowercased()) % UInt32(Rasgos.colores.count - 1))])
    }
    var body: some View {
        let faltan = Int(cita.inicio.timeIntervalSince(.now) / 60)
        let pasada = cita.fin < .now || cita.estado == "completada"
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(Formato.hora(cita.inicio, zona: zona)).font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(pasada ? Color.tinta3 : Color.tinta)
                Text(Formato.hora(cita.fin, zona: zona)).font(.caption.monospacedDigit()).foregroundStyle(Color.tinta3)
            }
            .frame(width: 48, alignment: .trailing)
            .padding(.top, 12)
            ZStack(alignment: .top) {
                Rectangle().fill(Color.tinta3.opacity(0.35)).frame(width: 1.5)
                Cuadrado(color: pasada ? .tinta3 : colorRecurso, lado: 9).padding(.top, 15)
            }
            .frame(width: 9)
            VStack(alignment: .leading, spacing: 6) {
                Text(cita.cliente_nombre).font(.body.weight(.semibold)).foregroundStyle(pasada ? Color.tinta2 : Color.tinta).lineLimit(1)
                Text(cita.servicio).font(.subheadline).foregroundStyle(Color.tinta2)
                HStack(spacing: 8) {
                    Text(cita.recurso).font(.footnote).foregroundStyle(colorRecurso)
                    if cita.personas > 1 { Text("\(cita.personas) personas").font(.footnote.monospacedDigit()).foregroundStyle(Color.tinta3) }
                    Spacer(minLength: 4)
                    if let c = cita.confirmacion, !pasada, !(cita.estado == "confirmada" && cita.llegada == nil && faltan < 0) {
                        Estampa(texto: c, tono: c == "Confirmó" ? .bueno : .alerta).fixedSize()
                    } else if cita.estado == "confirmada" && cita.llegada == nil && faltan < 0 && !pasada {
                        Estampa(texto: "lleva \(Formato.minutos(-faltan))", tono: faltan < -15 ? .critico : .alerta).fixedSize()
                    } else if cita.llegada != nil || cita.estado == "completada" {
                        Estampa(texto: cita.estado == "completada" ? "Atendida" : "Llegó", tono: .bueno).fixedSize()
                    } else if cita.estado == "no_asistio" {
                        Estampa(texto: "No llegó", tono: .tinta3).fixedSize()
                    } else if let p = cita.precio, p.valor > 0 {
                        Text(Formato.moneda(p)).font(.footnote.monospacedDigit()).foregroundStyle(Color.tinta3)
                    }
                }
            }
            .padding(14)
            .background(Color.panel, in: .rect(cornerRadius: 16))
            .opacity(pasada ? 0.7 : 1)
            .padding(.vertical, 5)
        }
    }
}

/// La tira de la semana, como en Calendario: siete días, el elegido en tinta, un cuadrito bajo los que tienen citas.
struct TiraSemana: View {
    @Binding var dia: Date
    var calendario: Calendar
    var conCitas: Set<String>   // "yyyy-MM-dd"
    private var dias: [Date] {
        let inicio = calendario.dateInterval(of: .weekOfYear, for: dia)?.start ?? dia
        return (0..<7).compactMap { calendario.date(byAdding: .day, value: $0, to: inicio) }
    }
    private func clave(_ d: Date) -> String {
        let f = DateFormatter(); f.calendar = calendario; f.timeZone = calendario.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from: d)
    }
    var body: some View {
        HStack(spacing: 4) {
            ForEach(dias, id: \.self) { d in
                let elegido = calendario.isDate(d, inSameDayAs: dia)
                let esHoy = calendario.isDateInToday(d)
                Button { withAnimation(.snappy) { dia = d } } label: {
                    VStack(spacing: 6) {
                        Text(letra(d)).font(.caption2.weight(.medium)).foregroundStyle(elegido ? Color.sobreFirme.opacity(0.75) : Color.tinta3)
                        Text("\(calendario.component(.day, from: d))").font(.body.weight(esHoy || elegido ? .bold : .regular).monospacedDigit())
                            .foregroundStyle(elegido ? Color.sobreFirme : esHoy ? Color.acento : Color.tinta)
                        Cuadrado(color: elegido ? Color.sobreFirme : Color.acento, lado: 4).opacity(conCitas.contains(clave(d)) ? 1 : 0)
                    }
                    .frame(maxWidth: .infinity).frame(height: 66)
                    .background(elegido ? Color.firme : Color.clear, in: .rect(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Formato.fecha(d, zona: calendario.timeZone.identifier, larga: true))
            }
        }
    }
    private func letra(_ d: Date) -> String {
        let f = DateFormatter(); f.calendar = calendario; f.timeZone = calendario.timeZone; f.locale = Locale(identifier: "es_MX"); f.dateFormat = "EEEEE"
        return f.string(from: d).uppercased()
    }
}
