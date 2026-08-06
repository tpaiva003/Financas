/**
 * Modelo dos emails da Rachar.
 *
 * Com a identidade da marca: quase-preto quente, off-white, a marca do disco
 * rachado e a assinatura do Porto. Escrito em HTML de tabelas e estilos em
 * linha, não porque seja bonito de ler, mas porque os clientes de email de 2026
 * continuam a ignorar CSS moderno: Outlook e Gmail cortam folhas de estilo,
 * flexbox e variáveis. É a única forma de o email chegar igual a toda a gente.
 */

const BG = "#0d0d10";
const PANEL = "#16161a";
const FG = "#f3f2ee";
const MUTED = "#a3a29c";
const FAINT = "#6d6c67";
const HAIR = "#2a2a2f";

/** A marca em SVG embutido: os clientes de email não carregam imagens externas. */
const MARK = `<svg width="26" height="26" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g fill="${FG}"><path d="M240 106a150 150 0 0 0 0 300Z" transform="translate(-14 -16)"/><path d="M272 106a150 150 0 0 1 0 300Z" transform="translate(14 16)"/></g></svg>`;

export interface EmailContent {
  /** Título grande, a primeira coisa que se lê. */
  heading: string;
  /** Parágrafos do corpo. */
  paragraphs: string[];
  /** Botão principal, se houver. */
  action?: { label: string; url: string };
  /** Texto pequeno no fim (avisos, validade, ligação alternativa). */
  footnote?: string;
}

export function renderEmail(content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${MUTED}">${p}</p>`,
    )
    .join("");

  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0">
         <tr><td style="border-radius:999px;background:${FG}">
           <a href="${content.action.url}"
              style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:${BG};text-decoration:none;border-radius:999px">
             ${content.action.label}
           </a>
         </td></tr>
       </table>`
    : "";

  const footnote = content.footnote
    ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:${FAINT}">${content.footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Rachar</title></head>
<body style="margin:0;padding:0;background:${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:${PANEL};border:1px solid ${HAIR};border-radius:18px">
        <tr><td style="padding:28px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:9px;vertical-align:middle">${MARK}</td>
            <td style="vertical-align:middle">
              <span style="font-size:16px;font-weight:600;color:${FG};letter-spacing:-0.01em">Rachar</span>
            </td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:24px 32px 32px">
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:600;color:${FG};letter-spacing:-0.02em">
            ${content.heading}
          </h1>
          ${paragraphs}
          ${action}
          ${footnote}
        </td></tr>
      </table>

      <p style="max-width:520px;margin:20px auto 0;font-size:11px;line-height:1.6;color:${FAINT};text-align:center;letter-spacing:0.08em;text-transform:uppercase">
        Contas à moda do Porto
      </p>
      <p style="max-width:520px;margin:8px auto 0;font-size:11px;line-height:1.6;color:${FAINT};text-align:center">
        <a href="https://rachar.pt/privacidade" style="color:${FAINT}">Privacidade</a> ·
        <a href="https://rachar.pt/termos" style="color:${FAINT}">Termos</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/** Versão em texto simples, para quem lê email sem HTML e para os filtros de spam. */
export function renderPlain(content: EmailContent): string {
  return [
    content.heading,
    "",
    ...content.paragraphs.map((p) => p.replace(/<[^>]+>/g, "")),
    content.action ? `\n${content.action.label}: ${content.action.url}` : "",
    content.footnote ? `\n${content.footnote.replace(/<[^>]+>/g, "")}` : "",
    "",
    "Rachar, contas à moda do Porto",
    "https://rachar.pt",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
