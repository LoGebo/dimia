import XCTest

/// Recorre las pantallas y guarda capturas; se corre a mano con CORREO y CLAVE en el entorno.
final class RecorridoUITests: XCTestCase {
    @MainActor
    func testRecorrido() throws {
        let app = XCUIApplication()
        let env = ProcessInfo.processInfo.environment
        app.launchArguments = ["-correo", env["CORREO"] ?? "", "-clave", env["CLAVE"] ?? ""]
        app.launch()
        let dir = env["CAPTURAS"] ?? NSTemporaryDirectory()
        func captura(_ nombre: String) {
            let png = app.screenshot().pngRepresentation
            try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(nombre).png"))
        }
        XCTAssertTrue(app.tabBars.buttons["Agentes"].waitForExistence(timeout: 20))
        app.tabBars.buttons["Hoy"].tap(); sleep(3); captura("01-hoy")
        if app.tabBars.buttons["Agenda"].exists { app.tabBars.buttons["Agenda"].tap(); sleep(3); captura("02-agenda") }
        app.tabBars.buttons["Mensajes"].tap(); sleep(3); captura("03-mensajes")
        let primera = app.cells.firstMatch
        if primera.waitForExistence(timeout: 3) { primera.tap(); sleep(3); captura("04-hilo-cliente"); app.navigationBars.buttons.firstMatch.tap() }
        app.tabBars.buttons["Agentes"].tap(); sleep(2)
        app.staticTexts["Recepción"].firstMatch.tap(); sleep(3); captura("05-recepcion")
        let campo = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        campo.tap(); campo.typeText("¿Qué citas hay hoy?")
        app.buttons["Enviar"].tap()
        sleep(12); captura("06-recepcion-respuesta")
        sleep(15); captura("07-recepcion-fin")
        app.buttons["Ajustes de Recepción"].tap(); sleep(3); captura("08-ficha")
    }
}
