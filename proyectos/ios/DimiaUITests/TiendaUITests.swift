import XCTest

/// Capturas para la App Store: Hoy, Agenda, Agentes, hilo de Recepción, Mensajes y Pedidos.
final class TiendaUITests: XCTestCase {
    @MainActor
    func testCapturas() throws {
        let env = ProcessInfo.processInfo.environment
        let dir = env["CAPTURAS"] ?? NSTemporaryDirectory()
        func abrir(_ negocio: String) -> XCUIApplication {
            let app = XCUIApplication()
            app.launchArguments = ["-correo", env["CORREO"] ?? "", "-clave", env["CLAVE"] ?? "", "-negocio", negocio]
            app.launch()
            XCTAssertTrue(app.tabBars.buttons["Agentes"].waitForExistence(timeout: 25))
            return app
        }
        func captura(_ app: XCUIApplication, _ n: String) { try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(n).png")) }

        var app = abrir(env["CLINICA"] ?? "")
        app.tabBars.buttons["Hoy"].tap(); sleep(4); captura(app, "1-hoy")
        app.tabBars.buttons["Agenda"].tap(); sleep(3); captura(app, "2-agenda")
        app.tabBars.buttons["Agentes"].tap(); sleep(3); captura(app, "3-agentes")
        app.staticTexts["Recepción"].firstMatch.tap(); sleep(5); captura(app, "4-recepcion")
        app.navigationBars.buttons.firstMatch.tap(); sleep(1)
        app.tabBars.buttons["Mensajes"].tap(); sleep(3); captura(app, "5-mensajes")
        app.terminate()

        app = abrir(env["TAQUERIA"] ?? "")
        app.tabBars.buttons["Pedidos"].tap(); sleep(4); captura(app, "6-pedidos")
    }
}
