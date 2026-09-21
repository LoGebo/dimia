import SwiftUI

/// El avatar del agente: una forma de color con dos ojos, como en Grok Bot. Se reconoce de reojo.
/// La forma y el color salen del nombre (mismo hash que el panel); Recepción es la gota azul.
nonisolated enum Rasgos {
    static let formas = ["gota", "circulo", "hexagono", "pastilla"]
    static let colores = ["#4f7cf5", "#3fb68b", "#f0a33c", "#e2685c", "#8b6cf0", "#2fb3b3", "#d05aa8"]

    static func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 0
        for u in s.utf16 { h = h &* 31 &+ UInt32(u) }
        return h
    }

    static func de(nombre: String, avatar: String?) -> (forma: String, color: String) {
        if let avatar, !avatar.hasPrefix("img:") {
            let p = avatar.split(separator: ":", maxSplits: 1).map(String.init)
            if p.count == 2, formas.contains(p[0]) { return (p[0], p[1]) }
        }
        if nombre.range(of: "recepci", options: .caseInsensitive) != nil { return ("gota", colores[0]) }
        if nombre.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("nuevo") { return ("circulo", "#8a93a6") }
        let h = hash(nombre.trimmingCharacters(in: .whitespaces).lowercased())
        return (formas[Int(h % UInt32(formas.count))], colores[1 + Int(h % UInt32(colores.count - 1))])
    }
}

extension Color {
    init(hex: String) {
        var s = hex; if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt32(s, radix: 16) ?? 0x6e9bf5
        self.init(UIColor(hex: v))
    }
}

/// La forma en un lienzo de 100×100 (mismos trazos que avatar-agente.tsx).
struct FormaAvatar: Shape {
    var forma: String
    func path(in r: CGRect) -> Path {
        let e = r.width / 100
        var p = Path()
        switch forma {
        case "gota":
            p.move(to: CGPoint(x: 50 * e, y: 6 * e))
            p.addCurve(to: CGPoint(x: 14 * e, y: 64 * e), control1: CGPoint(x: 50 * e, y: 6 * e), control2: CGPoint(x: 14 * e, y: 44 * e))
            p.addArc(center: CGPoint(x: 50 * e, y: 64 * e), radius: 36 * e, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: true)
            p.addCurve(to: CGPoint(x: 50 * e, y: 6 * e), control1: CGPoint(x: 86 * e, y: 44 * e), control2: CGPoint(x: 50 * e, y: 6 * e))
            p.closeSubpath()
        case "hexagono":
            p.move(to: CGPoint(x: 50 * e, y: 6 * e))
            for (x, y) in [(88, 27), (88, 73), (50, 94), (12, 73), (12, 27)] { p.addLine(to: CGPoint(x: CGFloat(x) * e, y: CGFloat(y) * e)) }
            p.closeSubpath()
        case "pastilla":
            p.addRoundedRect(in: CGRect(x: 2 * e, y: 22 * e, width: 96 * e, height: 56 * e), cornerSize: CGSize(width: 28 * e, height: 28 * e))
        default:
            p.addEllipse(in: CGRect(x: 8 * e, y: 8 * e, width: 84 * e, height: 84 * e))
        }
        return p
    }
}

struct AvatarAgente: View {
    var nombre: String
    var avatar: String?
    var tamano: CGFloat = 44
    var activo: Bool? = nil
    var trabajando = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if let avatar, avatar.hasPrefix("img:"), let datos = Self.datosImagen(avatar), let ui = UIImage(data: datos) {
                Image(uiImage: ui).resizable().scaledToFill().frame(width: tamano, height: tamano).clipShape(.circle)
            } else {
                let r = Rasgos.de(nombre: nombre, avatar: avatar)
                let e = tamano / 100
                let ojoY: CGFloat = ["gota": 66, "pastilla": 50][r.forma] ?? 52
                ZStack {
                    FormaAvatar(forma: r.forma).fill(LinearGradient(colors: [Color(hex: r.color).opacity(0.92), Color(hex: r.color)], startPoint: .top, endPoint: .bottom))
                    Ojos(trabajando: trabajando)
                        .frame(width: 30 * e, height: 16 * e)
                        .position(x: 50 * e, y: ojoY * e)
                }
                .frame(width: tamano, height: tamano)
            }
            if let activo {
                Cuadrado(color: activo ? .bueno : .tinta3, lado: max(8, tamano / 4.5))
                    .overlay(Rectangle().stroke(Color.fondo, lineWidth: 2))
            }
        }
        .frame(width: tamano, height: tamano)
        .accessibilityHidden(true)
    }

    nonisolated static func datosImagen(_ avatar: String) -> Data? {
        guard let coma = avatar.firstIndex(of: ",") else { return nil }
        return Data(base64Encoded: String(avatar[avatar.index(after: coma)...]))
    }
}

/// Dos ojos que parpadean; cuando el agente trabaja miran de un lado a otro (el avatar es el estado).
private struct Ojos: View {
    var trabajando: Bool
    @State private var parpadeo = false
    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            HStack(spacing: w * 0.28) {
                ojo(w, h).rotationEffect(.degrees(-8))
                ojo(w, h).rotationEffect(.degrees(8))
            }
            .frame(width: w, height: h)
            .phaseAnimator(trabajando ? [-1.0, 1.0, -1.0] : [0.0], content: { v, fase in
                v.offset(x: fase * w * 0.12)
            }, animation: { _ in .easeInOut(duration: 0.9) })
        }
        .task {
            // Un solo reloj para los dos ojos; si la vista se va a media pestañeada, los ojos quedan abiertos.
            defer { parpadeo = false }
            while !Task.isCancelled {
                guard (try? await Task.sleep(for: .seconds(Double.random(in: 2.5...6)))) != nil else { return }
                withAnimation(.easeInOut(duration: 0.08)) { parpadeo = true }
                guard (try? await Task.sleep(for: .milliseconds(120))) != nil else { return }
                withAnimation(.easeInOut(duration: 0.1)) { parpadeo = false }
            }
        }
    }
    private func ojo(_ w: CGFloat, _ h: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: w * 0.12).fill(Color(UIColor(hex: 0x0b0f17)))
            .frame(width: w * 0.24, height: parpadeo ? h * 0.15 : h)
    }
}
