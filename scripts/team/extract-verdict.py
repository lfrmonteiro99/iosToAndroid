#!/usr/bin/env python3
"""Extrai o JSON de veredicto do output de um agente e grava-o no ficheiro alvo.

Motivação (medida no #486, 2026-08-22): o hermes/deepseek, quando termina a
conversa sem executar a última acção (Write do veredicto em __VERDICT_PATH__),
imprime o JSON no stdout. O run-agent.sh faz tee desse stdout para o log e
depois deita-o fora — o ficheiro de veredicto nunca é criado e o caller lê
"SEM VEREDICTO" apesar de o trabalho estar documentado. O claude/ollama
escrevem o ficheiro diretamente; este script é a rede de segurança para os
motores que respondem em vez de escrever.

Uso: extract-verdict.py <ficheiro-alvo> [ficheiro-origem]
  - ficheiro-alvo:   onde gravar o JSON recuperado (nunca sobrescreve um JSON
                     válido já existente).
  - ficheiro-origem: ficheiro com o output do agente (default: stdin). Usar um
                     ficheiro evita o truncamento em NULs dos here-strings.
Exit 0 se um veredicto foi gravado, 1 caso contrário.
"""
import json
import sys

# Campos que identificam um objeto como veredicto. Um JSON com qualquer um
# deles vale mais do que o bloco JSON maior sem eles (o output do agente pode
# conter outros JSONs: eventos, tool calls, etc.).
VERDICT_KEYS = {
    "verdict", "outcome", "summary", "description", "tests",
    "files_changed", "approved", "changes_requested", "diff", "comment",
}


def score(obj):
    if not isinstance(obj, dict):
        return 0
    return sum(1 for k in obj if k in VERDICT_KEYS)


def find_best_json(text):
    """Devolve o objeto JSON com mais campos de veredicto (desempate: maior)."""
    best, best_score, best_len = None, -1, -1
    dec = json.JSONDecoder()
    n = len(text)
    i = 0
    while i < n:
        if text[i] != "{":
            i += 1
            continue
        try:
            obj, end = dec.raw_decode(text, i)
        except json.JSONDecodeError:
            i += 1
            continue
        s = score(obj)
        size = end - i
        if s > best_score or (s == best_score and s > 0 and size > best_len):
            best, best_score, best_len = obj, s, size
        i = end
    return best


def strip_fenced(text):
    """Se o output embrulhar o JSON em ```json ... ```, devolve só o bloco."""
    for marker in ("```json", "```JSON", "```"):
        if marker in text:
            head, _, rest = text.partition(marker)
            if "```" in rest:
                body, _, _ = rest.partition("```")
                return head + body + head  # só o corpo interessa
    return text


def main():
    target = sys.argv[1]
    source = sys.argv[2] if len(sys.argv) > 2 else None

    # Nunca sobrescrever um veredicto válido.
    if source is None:
        try:
            with open(target, "r", encoding="utf-8") as f:
                json.load(f)
            return 0
        except (OSError, ValueError):
            pass

    if source:
        try:
            with open(source, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        except OSError:
            return 1
    else:
        text = sys.stdin.read()

    obj = find_best_json(strip_fenced(text))
    if obj is None or score(obj) == 0:
        return 1

    with open(target, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
