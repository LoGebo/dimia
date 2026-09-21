import Testing
import Foundation
@testable import Dimia

struct SSETests {
    @Test func separaEventosDelStream() {
        let cuerpo = "data: {\"evento\": \"herramienta\", \"texto\": \"mcp__dimia__citas\", \"detalle\": \"hoy\"}\n\ndata: {\"evento\": \"herramienta_fin\", \"texto\": \"mcp__dimia__citas\", \"ok\": true, \"ms\": 212}\n\ndata: {\"evento\": \"texto\", \"texto\": \"Hay 3 citas.\"}\n\ndata: {\"evento\": \"fin\", \"texto\": \"\"}\n\n"
        let e = SSE.eventos(cuerpo)
        #expect(e.map(\.evento) == ["herramienta", "herramienta_fin", "texto", "fin"])
        #expect(e[1].ms == 212 && e[1].ok == true)
        #expect(Herramientas.describir("mcp__dimia__citas").hizo == "Revisó la agenda")
    }

    @Test func rasgosCoincidenConElPanel() {
        #expect(Rasgos.de(nombre: "Recepción", avatar: nil).forma == "gota")
        #expect(Rasgos.de(nombre: "Cobranza", avatar: "hexagono:#e2685c").color == "#e2685c")
        #expect(Rasgos.hash("Cobranza") == 3_446_773_744)  // (h*31 + c) >>> 0, igual que avatar-agente.tsx
    }
}
