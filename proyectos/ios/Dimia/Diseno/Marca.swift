import SwiftUI

// Los colores de marca/BRANDING.md, en versión clara y oscura. La app usa el sistema para todo lo demás:
// listas agrupadas, letra SF, vidrio en la navegación. El azul es el único acento; el cuadrado, la única forma.
extension Color {
    static func dinamico(_ claro: UInt32, _ oscuro: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: oscuro) : UIColor(hex: claro) })
    }
    static let tinta = dinamico(0x0b0f17, 0xeef1f7)
    static let tinta2 = dinamico(0x3d4658, 0xb4bccb)
    static let tinta3 = dinamico(0x6b7386, 0x7d8698)
    static let fondo = dinamico(0xf2f4f8, 0x0b0f17)
    static let panel = dinamico(0xffffff, 0x151b28)
    static let panel2 = dinamico(0xe9edf4, 0x1d2536)
    static let acento = dinamico(0x1f47c4, 0x6e9bf5)
    static let bueno = dinamico(0x1f9d6a, 0x3fb68b)
    static let alerta = dinamico(0xb7791f, 0xf0a33c)
    static let critico = dinamico(0xc0392b, 0xe2685c)
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
    }
}

/// El cuadrado: estado, viñeta, remate. Nunca un círculo.
struct Cuadrado: View {
    var color: Color
    var lado: CGFloat = 7
    var body: some View { Rectangle().fill(color).frame(width: lado, height: lado) }
}

/// Cifras siempre con dígitos tabulares.
extension Font {
    static func cifra(_ estilo: Font.TextStyle = .title2, peso: Font.Weight = .semibold) -> Font {
        .system(estilo).weight(peso).monospacedDigit()
    }
}

/// Estado corto junto a un cuadrado de color.
struct Estampa: View {
    var texto: String
    var tono: Color
    var body: some View {
        HStack(spacing: 5) { Cuadrado(color: tono, lado: 5); Text(texto).font(.caption.monospacedDigit()).foregroundStyle(tono) }
    }
}

/// Un vacío que dice qué hacer, no un adorno.
struct Vacio: View {
    var titulo: String
    var detalle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(titulo).font(.body).foregroundStyle(Color.tinta)
            if let detalle { Text(detalle).font(.subheadline).foregroundStyle(Color.tinta3) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
    }
}

/// Un error de red, con qué pasó y cómo salir.
struct FilaError: View {
    var texto: String
    var reintentar: () -> Void
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Cuadrado(color: .critico).padding(.top, 5)
            Text(texto).font(.subheadline).foregroundStyle(Color.tinta2)
            Spacer()
            Button("Reintentar", action: reintentar).font(.subheadline.weight(.semibold))
        }
    }
}

/// Listas agrupadas del sistema con el fondo de marca.
extension View {
    func listaDimia() -> some View {
        self.listStyle(.insetGrouped).scrollContentBackground(.hidden).background(Color.fondo)
    }
}
