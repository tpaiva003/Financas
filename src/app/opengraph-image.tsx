import { ImageResponse } from "next/og";

/**
 * A imagem que aparece quando alguém partilha rachar.pt — WhatsApp, iMessage,
 * LinkedIn, resultados de pesquisa. Gerada aqui em vez de um PNG no /public
 * para dizer sempre o mesmo que a landing sem ninguém se lembrar de a refazer.
 *
 * Sem imagem, a partilha sai como um link cinzento sem cara — e uma app cuja
 * distribuição é "manda o link à pessoa com quem partilhas casa" vive disto.
 */
export const runtime = "edge";
export const alt = "Rachar: contas partilhadas e património, à moda do Porto";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          backgroundColor: "#08080a",
          color: "#f3f2ee",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              backgroundColor: "#4f8cff",
            }}
          />
          <div style={{ fontSize: 34, letterSpacing: 6, color: "#8a8886" }}>
            CONTAS À MODA DO PORTO
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1 }}>Rachar</div>
          <div style={{ marginTop: 28, fontSize: 42, color: "#b9b7b2", lineHeight: 1.3 }}>
            Divide as despesas, importa extratos e acompanha o património.
          </div>
        </div>
        <div style={{ fontSize: 30, color: "#8a8886" }}>rachar.pt</div>
      </div>
    ),
    size,
  );
}
