import SwiftUI

struct Acceso: View {
    @Environment(Sesion.self) private var sesion
    @State private var email = ""
    @State private var password = ""
    @State private var enviando = false
    @State private var error: String?
    @FocusState private var foco: Campo?
    enum Campo { case email, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .lastTextBaseline, spacing: 6) {
                        Text("Dimia").font(.system(size: 34, weight: .light, design: .serif)).foregroundStyle(Color.tinta)
                        Cuadrado(color: .acento, lado: 8)
                    }
                    Text("Entre con el correo y la contraseña de su panel.")
                        .font(.subheadline).foregroundStyle(Color.tinta2)
                }
                .padding(.top, 60)

                VStack(spacing: 14) {
                    campo("Correo", texto: $email, contenido: .emailAddress, foco: .email)
                    campo("Contraseña", texto: $password, seguro: true, foco: .password)
                }

                if let error {
                    HStack(spacing: 8) { Cuadrado(color: .critico); Text(error).font(.footnote).foregroundStyle(Color.critico) }
                }

                Button {
                    Task { await entrar() }
                } label: {
                    Group { if enviando { ProgressView().tint(.white) } else { Text("Entrar").font(.body.weight(.semibold)) } }
                        .frame(maxWidth: .infinity).frame(height: 48)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.roundedRectangle(radius: 0))
                .disabled(enviando || email.isEmpty || password.isEmpty)

                Text("Su cuenta se crea desde dimia.mx. Aquí solo entra.")
                    .font(.footnote).foregroundStyle(Color.tinta3)
            }
            .padding(.horizontal, 24)
        }
        .background(Color.fondo)
        .scrollDismissesKeyboard(.interactively)
        .onSubmit { if foco == .email { foco = .password } else { Task { await entrar() } } }
        .task {
            #if DEBUG
            // Para probar en el simulador: `simctl launch booted mx.dimia.app -correo x -clave y`.
            if let c = UserDefaults.standard.string(forKey: "correo"), let k = UserDefaults.standard.string(forKey: "clave"), email.isEmpty {
                email = c; password = k; await entrar()
            }
            #endif
        }
    }

    private func campo(_ titulo: String, texto: Binding<String>, contenido: UITextContentType? = nil, seguro: Bool = false, foco f: Campo) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titulo).font(.caption.weight(.semibold)).foregroundStyle(Color.tinta3)
            Group {
                if seguro { SecureField("", text: texto).textContentType(.password) }
                else { TextField("", text: texto).textContentType(contenido).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }
            }
            .font(.body)
            .padding(.horizontal, 14).frame(height: 48)
            .background(Color.panel)
            .overlay(Rectangle().stroke(foco == f ? Color.acento : Color.linea, lineWidth: 1))
            .focused($foco, equals: f)
        }
    }

    private func entrar() async {
        guard !enviando else { return }
        enviando = true; error = nil
        defer { enviando = false }
        do { try await sesion.entrar(email: email, password: password) }
        catch { self.error = error.localizedDescription }
    }
}
