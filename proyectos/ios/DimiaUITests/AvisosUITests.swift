import XCTest

/// Acepta el permiso de notificaciones (lo muestra SpringBoard) y abre la campanita.
final class AvisosUITests: XCTestCase {
    @MainActor
    func testPermisoYCampanita() throws {
        let env = ProcessInfo.processInfo.environment
        let app = XCUIApplication()
        app.launchArguments = ["-correo", env["CORREO"] ?? "", "-clave", env["CLAVE"] ?? "", "-negocio", env["NEGOCIO"] ?? ""]
        app.launch()
        let permitir = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
        if permitir.waitForExistence(timeout: 15) { permitir.tap() }
        XCTAssertTrue(app.buttons["Avisos"].waitForExistence(timeout: 10) || app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Avisos'")).firstMatch.exists)
        sleep(3)
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Avisos'")).firstMatch.tap()
        sleep(3)
        try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: env["CAPTURAS"] ?? NSTemporaryDirectory()).appendingPathComponent("avisos.png"))
    }
}
