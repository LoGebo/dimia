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
            VStack(alignment: .leading, spacing: 32) {
                Image("Logotipo").resizable().scaledToFit().frame(width: 150).foregroundStyle(Color.tinta)
                    .padding(.top, 72)
                    .accessibilityLabel("Dimia")

                VStack(alignment: .leading, spacing: 18) {
                    Text("Entre con el correo y la contraseña de su panel.")
                        .font(.body).foregroundStyle(Color.tinta2)
                    campo("Correo", texto: $email, contenido: .emailAddress, foco: .email)
                    campo("Contraseña", texto: $password, seguro: true, foco: .password)
                }

                if let error {
                    HStack(alignment: .firstTextBaseline, spacing: 8) { Cuadrado(color: .critico); Text(error).font(.subheadline).foregroundStyle(Color.critico) }
                }

                Button {
                    Task { await entrar() }
                } label: {
                    Group { if enviando { ProgressView().tint(.white) } else { Text("Entrar").font(.body.weight(.semibold)) } }
                        .frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .disabled(enviando || email.isEmpty || password.isEmpty)

                Text("La cuenta se crea en dimia.mx; aquí solo entra.")
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
            Text(titulo).font(.subheadline).foregroundStyle(Color.tinta2)
            Group {
                if seguro { SecureField("", text: texto).textContentType(.password) }
                else { TextField("", text: texto).textContentType(contenido).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled() }
            }
            .font(.body)
            .padding(.horizontal, 14).frame(height: 50)
            .background(Color.panel, in: .rect(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(foco == f ? Color.acento : Color.clear, lineWidth: 1.5))
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
