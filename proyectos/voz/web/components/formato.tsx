/**
 * Formato ligero para lo que escribe un agente: párrafos, listas con guion o
 * número, negritas con ** **. Sin librería: lo que un chat necesita y nada más.
 */
export function Formato({ texto }: { texto: string }) {
  const bloques = texto.replace(/\r/g, "").trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {bloques.map((b, i) => {
        const lineas = b.split("\n");
        const lista = lineas.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l));
        if (lista) {
          const numerada = /^\s*\d+[.)]/.test(lineas[0]!);
          const Tag = numerada ? "ol" : "ul";
          return (
            <Tag key={i} className={`space-y-1 pl-5 ${numerada ? "list-decimal" : "list-disc"}`}>
              {lineas.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ""))}</li>)}
            </Tag>
          );
        }
        if (/^#{1,3}\s/.test(lineas[0]!)) return <p key={i} className="font-semibold">{inline(b.replace(/^#{1,3}\s/, ""))}</p>;
        return <p key={i} className="whitespace-pre-wrap">{lineas.map((l, j) => <span key={j}>{j ? <br /> : null}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}

function inline(t: string) {
  const partes = t.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : p));
}
