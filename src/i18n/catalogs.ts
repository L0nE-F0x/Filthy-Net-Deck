import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { ja } from "./ja";
import { ko } from "./ko";
import { ptBR } from "./pt-BR";
import { registerCatalogs } from "./t";

registerCatalogs({
  en,
  es,
  fr,
  de,
  it,
  "pt-BR": ptBR,
  ja,
  ko,
});
