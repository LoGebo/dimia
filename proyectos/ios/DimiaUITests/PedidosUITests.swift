import XCTest

/// Cambia de día muchas veces en Pedidos y en Agenda: antes esto tronaba la app. Corre con NEGOCIO, DIA y CAPTURAS.
final class PedidosUITests: XCTestCase {
    @MainActor
    func testCambiarDeDia() throws {
        let app = XCUIApplication()
        let env = ProcessInfo.processInfo.environment
        // Sin credenciales no corren: `test` a secas solo corre DimiaTests. Con API=<url> no tocan producción.
        try XCTSkipIf((env["CORREO"] ?? "").isEmpty, "Se corre a mano con CORREO y CLAVE.")
        app.launchArguments = ["-correo", env["CORREO"] ?? "", "-clave", env["CLAVE"] ?? "", "-negocio", env["NEGOCIO"] ?? "", "-dia", env["DIA"] ?? ""] + (env["API"].map { ["-api", $0] } ?? [])
        app.launch()
        let dir = env["CAPTURAS"] ?? NSTemporaryDirectory()
        func captura(_ n: String) { try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(n).png")) }

        let pestana = app.tabBars.buttons["Pedidos"].waitForExistence(timeout: 20) ? "Pedidos" : "Agenda"
        app.tabBars.buttons[pestana].tap(); sleep(3)
        captura("dia-0")
        let anterior = app.buttons["Día anterior"], siguiente = app.buttons["Día siguiente"]
        if anterior.exists {
            for _ in 0..<6 { anterior.tap() }
            for _ in 0..<4 { siguiente.tap(); usleep(200_000) }
        } else {
            // Agenda: la tira de la semana se desliza y los días se tocan.
            for _ in 0..<3 { app.swipeLeft() }
            for _ in 0..<5 { app.swipeRight() }
        }
        sleep(3)
        XCTAssertEqual(app.state, .runningForeground, "la app se cerró al cambiar de día")
        captura("dia-1")
        app.buttons["Hoy"].firstMatch.tap(); sleep(2)
        XCTAssertEqual(app.state, .runningForeground)
        captura("dia-2")
    }
}
