/**
 * O `pdf-parse` não traz tipos e o seu index tem um bloco de debug que tenta ler
 * um ficheiro de teste quando empacotado, por isso importamos o módulo interno.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export default pdfParse;
}
