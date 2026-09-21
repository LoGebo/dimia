import Foundation

// Espejo de lo que devuelve la API (proyectos/voz/api). Los nombres van en snake_case como en la API.

nonisolated struct Tokens: Codable, Sendable {
    var access: String
    var refresh: String
    var expira_seg: Int
}

nonisolated struct Negocio: Codable, Sendable, Identifiable, Hashable {
    var tenant_id: UUID
    var nombre: String
    var vertical: String
    var vertical_nombre: String
    var herramientas: [String]
    var rol: String
    var zona_horaria: String
    var id: UUID { tenant_id }
    var agenda: Bool { herramientas.contains("agendar") }
}

nonisolated struct Yo: Codable, Sendable {
    var id: UUID
    var email: String
    var negocios: [Negocio]
}

nonisolated struct Cita: Codable, Sendable, Identifiable, Hashable {
    var id: UUID
    var codigo: String
    var cliente_nombre: String
    var telefono: String
    var personas: Int
    var notas: String?
    var inicio: Date
    var fin: Date
    var estado: String
    var llegada: Date?
    var confirmado_por_cliente: Date?
    var confirmacion_enviada: Bool
    var cliente_id: UUID?
    var precio: Monto?
    var servicio: String
    var recurso: String
    var cobrado: Monto?

    /// Cómo va la confirmación del día anterior: confirmó, sin confirmar, o no se le preguntó.
    var confirmacion: String? {
        if confirmado_por_cliente != nil { return "Confirmó" }
        if confirmacion_enviada { return "Sin confirmar" }
        return nil
    }
}

/// Dinero: la API lo manda como texto ("1250.00") para no perder centavos; aquí es Decimal.
nonisolated struct Monto: Codable, Sendable, Hashable {
    var valor: Decimal
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self), let d = Decimal(string: s) { valor = d }
        else { valor = try c.decode(Decimal.self) }
    }
    func encode(to encoder: Encoder) throws { var c = encoder.singleValueContainer(); try c.encode("\(valor)") }
}

nonisolated struct Avisos: Codable, Sendable {
    var retrasadas: Int
    var escaladas: Int
    var recados: Int
    var cobros_pendientes: Int
    var cobros_monto: Monto
    var por_cobrar_atendidas: Int
    var mensajes_sin_leer: Int
}

nonisolated struct Cobros: Codable, Sendable {
    var cobrado: Monto
    var operaciones: Int
    var pendiente: Monto
}

nonisolated struct Conversacion: Codable, Sendable, Identifiable, Hashable {
    var id: UUID
    var canal: String
    var contacto: String
    var contacto_nombre: String?
    var cliente_id: UUID?
    var estado: String
    var motivo: String?
    var resultado: String?
    var resumen: String?
    var ultimo_mensaje: String?
    var ultimo_mensaje_en: Date
    var mensajes_sin_leer: Int

    var nombre: String { contacto_nombre ?? Formato.telefono(contacto) }
    var canalNombre: String {
        ["whatsapp": "WhatsApp", "llamada": "Llamada", "instagram": "Instagram", "messenger": "Messenger", "sms": "SMS"][canal] ?? canal
    }
}

nonisolated struct Mensaje: Codable, Sendable, Identifiable, Hashable {
    var id: UUID
    var autor: String
    var texto: String
    var herramienta: String?
    var creado: Date
}

nonisolated struct Hoy: Codable, Sendable {
    var dia: String
    var zona_horaria: String
    var avisos: Avisos
    var citas: [Cita]
    var cobros: Cobros
    var conversaciones: [Conversacion]
}

nonisolated struct Agente: Codable, Sendable, Identifiable, Hashable {
    var id: UUID
    var nombre: String
    var trabajo: String?
    var reglas: String?
    var avatar: String?
    var permisos: [String]
    var estado: String
    var rol: String
    var personalidad: String?
    var ajustes: [String: String]
    var creado: Date
    var donde: String

    var activo: Bool { estado == "activo" }
    var recepcion: Bool { rol == "recepcion" }
    /// Un agente con trabajo ya vive en su máquina (Hermes); sin trabajo, todavía se está presentando.
    var conCerebro: Bool { trabajo != nil }
}

nonisolated struct AgenteCambios: Codable, Sendable {
    var nombre: String?
    var trabajo: String?
    var reglas: String?
    var avatar: String?
    var permisos: [String]?
    var estado: String?
    var personalidad: String?
    var ajustes: [String: String]?
}

nonisolated struct Paso: Codable, Sendable, Identifiable, Hashable {
    var herramienta: String
    var detalle: String?
    var ms: Int?
    var ok: Bool?
    var id: String { herramienta + (detalle ?? "") + String(ms ?? -1) }
}

nonisolated struct MensajeAgente: Codable, Sendable {
    var id: Int
    var de: String
    var texto: String
    var creado: String
    var pasos: [Paso]?
}

nonisolated struct UltimoMensaje: Codable, Sendable {
    var agente_id: UUID
    var de: String
    var texto: String
    var creado: Date
}

nonisolated struct Rutina: Codable, Sendable, Identifiable {
    var id: String
    var nombre: String
    var horario: String
    var activa: Bool
    var ultima: String?
    var proxima: String?
}

nonisolated struct Rutinas: Codable, Sendable {
    var estado: String
    var rutinas: [Rutina]
}

nonisolated struct CatalogoSkill: Codable, Sendable, Identifiable {
    var clave: String
    var nombre: String
    var detalle: String
    var agentes: [String]
    var id: String { clave }
}

nonisolated struct CatalogoIntegracion: Codable, Sendable, Identifiable {
    var clave: String
    var nombre: String
    var detalle: String
    var lista: Bool
    var cuenta: String?
    var agentes: [String]
    var id: String { clave }
}

nonisolated struct Catalogo: Codable, Sendable {
    var skills: [CatalogoSkill]
    var integraciones: [CatalogoIntegracion]
}

nonisolated struct EstadoCerebro: Codable, Sendable {
    var estado: String  // conectado | pendiente | sin_conectar
    var cuenta: String?
    var cerebro: String?
}

/// Un evento del stream del agente (SSE del orquestador).
nonisolated struct Evento: Codable, Sendable {
    var evento: String?
    var texto: String?
    var detalle: String?
    var ok: Bool?
    var ms: Int?
    var run_id: String?
    var request_id: String?
    var modo: String?     // guiado | en_cola, cuando el agente ya estaba trabajando
    var estado: Int?
}

nonisolated struct ErrorApi: Codable, Sendable, Error {
    var error: String
    var detalle: String
}

nonisolated enum Formato {
    static func telefono(_ t: String) -> String {
        let d = t.filter(\.isNumber)
        guard d.count >= 10 else { return t }
        let n = d.suffix(10)
        let i = n.startIndex
        return "\(n[i..<n.index(i, offsetBy: 3)]) \(n[n.index(i, offsetBy: 3)..<n.index(i, offsetBy: 6)]) \(n[n.index(i, offsetBy: 6)...])"
    }

    static func moneda(_ m: Monto) -> String { moneda(m.valor) }
    static func moneda(_ d: Decimal) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "es_MX")
        f.maximumFractionDigits = 0
        return f.string(from: d as NSDecimalNumber) ?? "$\(d)"
    }

    static func hora(_ fecha: Date, zona: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = TimeZone(identifier: zona)
        f.dateFormat = "HH:mm"
        return f.string(from: fecha)
    }

    static func fecha(_ fecha: Date, zona: String, larga: Bool = false) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.timeZone = TimeZone(identifier: zona)
        f.dateFormat = larga ? "EEEE d 'de' MMMM" : "EEE d MMM"
        return f.string(from: fecha)
    }

    static func minutos(_ m: Int) -> String {
        m >= 60 ? "\(m / 60) h \(m % 60 == 0 ? "" : "\(m % 60) min")".trimmingCharacters(in: .whitespaces) : "\(m) min"
    }

    /// «Hoy 8:00», «Ayer 17:30», «Lun 21 sep 9:15»: el separador de hora del hilo.
    static func momento(_ fecha: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_MX"); f.dateFormat = "HH:mm"
        let c = Calendar.current
        if c.isDateInToday(fecha) { return "Hoy " + f.string(from: fecha) }
        if c.isDateInYesterday(fecha) { return "Ayer " + f.string(from: fecha) }
        let d = DateFormatter(); d.locale = Locale(identifier: "es_MX"); d.dateFormat = "EEE d MMM HH:mm"
        return d.string(from: fecha).replacingOccurrences(of: ".", with: "").capitalizedFirst
    }

    /// Hora si fue hoy, «Ayer», el día de la semana si fue esta semana, la fecha si no: como en Mensajes.
    static func cuando(_ fecha: Date) -> String {
        let c = Calendar.current
        let f = DateFormatter(); f.locale = Locale(identifier: "es_MX")
        if c.isDateInToday(fecha) { f.dateFormat = "HH:mm"; return f.string(from: fecha) }
        if c.isDateInYesterday(fecha) { return "Ayer" }
        if let semana = c.date(byAdding: .day, value: -6, to: .now), fecha > semana { f.dateFormat = "EEEE"; return f.string(from: fecha).capitalizedFirst }
        f.dateFormat = "d MMM"; return f.string(from: fecha).replacingOccurrences(of: ".", with: "")
    }

    static func relativo(_ fecha: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.unitsStyle = .short
        return f.localizedString(for: fecha, relativeTo: .now)
    }
}
