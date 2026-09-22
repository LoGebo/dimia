import XCTest

/// Abre la pestaña de Pedidos y la captura; corre con NEGOCIO (comida) y DIA en el entorno.
final class PedidosUITests: XCTestCase {
    @MainActor
    func testPedidos() throws {
        let app = XCUIApplication()
        let env = ProcessInfo.processInfo.environment
        app.launchArguments = ["-correo", env["CORREO"] ?? "", "-clave", env["CLAVE"] ?? "", "-negocio", env["NEGOCIO"] ?? "", "-dia", env["DIA"] ?? ""]
        app.launch()
        let dir = env["CAPTURAS"] ?? NSTemporaryDirectory()
        XCTAssertTrue(app.tabBars.buttons["Pedidos"].waitForExistence(timeout: 20))
        app.tabBars.buttons["Pedidos"].tap(); sleep(4)
        try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("pedidos.png"))
        app.swipeUp(); sleep(1)
        try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("pedidos-2.png"))
    }
}
