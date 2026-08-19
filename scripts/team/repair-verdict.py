#!/usr/bin/env python3
"""Normaliza o veredicto de um agente para JSON que o jq consiga ler.

PORQUE ISTO EXISTE

O veredicto era lido directamente com `jq` através do `jqv()`, que engole o erro de
parse e devolve o valor por omissão. Para o `outcome` esse valor é `blocked` — logo
**um JSON malformado era indistinguível de um agente que se declarou bloqueado**, e
o `implement.sh` mandava o issue para o curator analisar um problema que não existe.

Medido no #217: o `gpt-oss:20b-cloud` implementou, escreveu o ficheiro de teste, e
declarou `"outcome": "implemented"` — mas dentro do `description` escreveu

    mensagem "onPress impreciso - double call" (exemplo)

com as aspas por escapar. O ficheiro deixou de fazer parse, o `jqv` devolveu
`blocked`, e o trabalho foi para `qa:blocked-spec`. Nada no log dizia que o
problema era de sintaxe.

Isto não é um problema de um modelo fraco: qualquer motor pode emitir isto, e o
custo é sempre o mesmo — trabalho real mal encaminhado, em silêncio.

O reparador do projecto irmão (companion-chat) trata de cercas ```json, prosa à
volta do objecto, caracteres de controlo crus e escapes inválidos. Não trata de
aspas por escapar dentro de uma string, que é exactamente o caso acima — daí o
passo de salvamento ancorado nas chaves, no fim.

Reescreve o ficheiro em JSON canónico. Sai 0 se conseguiu, 1 se não há nada de
aproveitável — e nesse caso quem chama trata como "sem veredicto" e volta a pôr o
trabalho na fila, em vez de o classificar mal.

Uso: repair-verdict.py <ficheiro>
"""
import json
import re
import sys

# As chaves que os veredictos deste pipeline usam, por papel. Servem de âncora ao
# salvamento: só se sabe onde acaba um valor com aspas a mais se se souber onde
# começa o próximo campo.
KNOWN_KEYS = [
    # implement
    "outcome", "summary", "description", "tests", "files_changed",
    # review
    "verdict", "lint_pass", "typecheck_pass", "tests_pass", "issue_resolved",
    "description_matches_diff", "has_tests", "red_step_proven",
    "edge_cases_covered", "fixes_root_cause", "junk_files", "secrets_found",
    "required_changes",
    # curator
    "analysis", "priority", "subissues",
]


def candidates(raw):
    """Do mais fiel ao mais agressivo. O primeiro que fizer parse ganha."""
    yield raw
    fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL)
    if fenced:
        yield fenced.group(1)
    i, j = raw.find("{"), raw.rfind("}")
    if i != -1 and j > i:
        yield raw[i : j + 1]


def parse(text):
    # strict=False aceita caracteres de controlo crus dentro de strings, que é o
    # caso mais comum: um \n literal a meio do "summary".
    for strict in (True, False):
        try:
            return json.loads(text, strict=strict)
        except Exception:
            pass
    # Escapar barras invertidas que não abrem um escape válido.
    patched = re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", text)
    try:
        return json.loads(patched, strict=False)
    except Exception:
        return None


def salvage_by_keys(raw):
    """Último recurso: extrair cada campo conhecido e reescapá-lo.

    Um valor de string vai de `"chave": "` até às aspas que precedem a próxima
    chave conhecida (ou o fecho do objecto). Tudo o que estiver pelo meio — aspas
    incluídas — é conteúdo, e é reescapado por nós em vez de se confiar no modelo.

    Deliberadamente conservador: só reconhece as chaves do esquema. Um veredicto
    que não tenha nenhuma delas não é salvo, e é isso que se quer — melhor voltar à
    fila do que inventar um resultado.
    """
    obj = {}
    keys_alt = "|".join(re.escape(k) for k in KNOWN_KEYS)
    # Onde começa cada campo conhecido.
    starts = [(m.start(), m.group(1), m.end())
              for m in re.finditer(r'"(' + keys_alt + r')"\s*:\s*', raw)]
    if not starts:
        return None

    for idx, (_, key, val_at) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(raw)
        chunk = raw[val_at:end]
        # Aparar a vírgula/chaveta que pertence ao campo seguinte.
        chunk = re.sub(r'[\s,]*$', '', chunk)
        chunk = re.sub(r'\}\s*$', '', chunk).rstrip().rstrip(',')

        if chunk.startswith('"'):
            body = chunk[1:]
            if body.endswith('"'):
                body = body[:-1]
            # Reescapar do zero: desfazer os escapes que o modelo acertou, para não
            # os duplicar, e depois escapar tudo corretamente.
            body = body.replace('\\"', '"').replace("\\\\", "\\")
            obj[key] = body
        else:
            try:
                obj[key] = json.loads(chunk)
            except Exception:
                obj[key] = chunk.strip()
    return obj or None


def main():
    if len(sys.argv) != 2:
        print("uso: repair-verdict.py <ficheiro>", file=sys.stderr)
        return 1
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
    except OSError as exc:
        print(f"repair-verdict: não consegui ler {path}: {exc}", file=sys.stderr)
        return 1

    for text in candidates(raw):
        obj = parse(text)
        if isinstance(obj, dict):
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(obj, fh, ensure_ascii=False)
            return 0

    obj = salvage_by_keys(raw)
    if isinstance(obj, dict):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, ensure_ascii=False)
        print("repair-verdict: salvo por âncora de chaves (JSON estava malformado)",
              file=sys.stderr)
        return 0

    print("repair-verdict: nada de aproveitável no veredicto", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
