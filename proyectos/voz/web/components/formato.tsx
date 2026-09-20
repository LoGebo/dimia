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
          const inicio = numerada ? Number(/^\s*(\d+)/.exec(lineas[0]!)![1]) : undefined;
          return (
            <Tag key={i} start={inicio} className={`space-y-1 pl-5 ${numerada ? "list-decimal" : "list-disc"}`}>
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

/** Negritas, enlaces [texto](url) y direcciones sueltas. */
function inline(t: string) {
  const partes = t.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+)/g);
  return partes.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    const enlace = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p);
    if (enlace) return <a key={i} href={enlace[2]} target="_blank" rel="noreferrer" className="underline decoration-tinta-3 underline-offset-2 hover:decoration-tinta">{enlace[1]}</a>;
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all underline decoration-tinta-3 underline-offset-2 hover:decoration-tinta">{p.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>;
    return p;
  });
}
