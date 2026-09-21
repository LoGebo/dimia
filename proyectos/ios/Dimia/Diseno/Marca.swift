import SwiftUI

// Los colores de marca/BRANDING.md. Tinta de fondo y hueso de texto en oscuro; en claro se invierte
// y el azul pasa a #1f47c4. El cuadrado es la única forma del sistema.
extension Color {
    static func dinamico(_ claro: UInt32, _ oscuro: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: oscuro) : UIColor(hex: claro) })
    }
    static let tinta = dinamico(0x0b0f17, 0xeef1f7)       // texto principal
    static let tinta2 = dinamico(0x3d4658, 0xb4bccb)      // texto secundario
    static let tinta3 = dinamico(0x6b7386, 0x7d8698)      // rótulos y notas
    static let fondo = dinamico(0xf4f6fa, 0x0b0f17)
    static let panel = dinamico(0xffffff, 0x121826)
    static let panel2 = dinamico(0xeef1f7, 0x1a2133)
    static let linea = dinamico(0xdfe4ee, 0x242c3d)
    static let acento = dinamico(0x1f47c4, 0x6e9bf5)
    static let laton = Color(UIColor(hex: 0xc8a45c))
    static let bueno = dinamico(0x1f9d6a, 0x3fb68b)
    static let alerta = dinamico(0xb7791f, 0xf0a33c)
    static let critico = dinamico(0xc0392b, 0xe2685c)
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
}

/// El cuadrado: viñeta, estado, remate. Nunca un círculo.
struct Cuadrado: View {
    var color: Color
    var lado: CGFloat = 6
    var body: some View { Rectangle().fill(color).frame(width: lado, height: lado) }
}

/// Rótulo de sección, en latón y mayúsculas chicas, como en el panel.
struct Rotulo: View {
    var texto: String
    var body: some View {
        Text(texto.uppercased())
            .font(.system(.caption2, design: .monospaced).weight(.semibold))
            .tracking(1.2)
            .foregroundStyle(Color.laton)
    }
}

/// Cifras siempre con dígitos tabulares.
extension Font {
    static func cifra(_ estilo: Font.TextStyle = .title2, peso: Font.Weight = .semibold) -> Font {
        .system(estilo, design: .default).weight(peso).monospacedDigit()
    }
}

/// Una tarjeta plana: fondo panel, línea fina, sin esquinas redondeadas ni sombra.
struct Tarjeta<Contenido: View>: View {
    @ViewBuilder var contenido: Contenido
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { contenido }
            .background(Color.panel)
            .overlay(Rectangle().stroke(Color.linea, lineWidth: 1))
    }
}

struct Vacio: View {
    var titulo: String
    var detalle: String? = nil
    var body: some View {
        VStack(spacing: 6) {
            Text(titulo).font(.subheadline.weight(.semibold)).foregroundStyle(Color.tinta)
            if let detalle { Text(detalle).font(.footnote).foregroundStyle(Color.tinta3).multilineTextAlignment(.center) }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

/// Muestra un error de red de forma uniforme y deja reintentar.
struct FilaError: View {
    var texto: String
    var reintentar: () -> Void
    var body: some View {
        HStack(spacing: 10) {
            Cuadrado(color: .critico)
            Text(texto).font(.footnote).foregroundStyle(Color.tinta2)
            Spacer()
            Button("Reintentar", action: reintentar).font(.footnote.weight(.semibold))
        }
        .padding(12)
        .background(Color.panel)
        .overlay(Rectangle().stroke(Color.linea, lineWidth: 1))
    }
}
