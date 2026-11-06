"""Normalização de texto em português brasileiro para o interpretador local.

Nada de modelos neurais aqui: normalização + dicionário de sinônimos + regras.
É determinístico, rápido e auditável — e é isso que permite funcionar 100% offline.
"""
from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------- números ----
UNITS = {
    "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
    "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
    "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "catorze": 14,
    "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18, "dezenove": 19,
    "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50, "sessenta": 60,
    "setenta": 70, "oitenta": 80, "noventa": 90, "cem": 100, "cento": 100,
}

# --------------------------------------------------------------- sinônimos ---
# Cada grupo: a primeira palavra é a forma canônica.
SYNONYMS: list[list[str]] = [
    ["abrir", "abre", "abra", "abri", "abrir", "iniciar", "inicia", "inicie", "executar",
     "executa", "rode", "roda", "lancar", "lanca", "carregar", "carrega", "chamar", "chama"],
    ["fechar", "fecha", "feche", "encerrar", "encerra", "encerre", "matar", "mata", "mate",
     "finalizar", "finaliza", "sair", "quit"],
    ["navegador", "browser", "internet"],
    ["programa", "programas", "app", "apps", "aplicativo", "aplicativos", "software"],
    ["pasta", "diretorio", "diretorios", "folder"],
    ["arquivo", "arquivos", "file", "files", "documento", "documentos"],
    ["computador", "pc", "maquina", "notebook", "micro"],
    ["desempenho", "performance", "saude", "recursos"],
    ["memoria", "ram", "memoria ram"],
    ["processador", "cpu", "processamento"],
    ["disco", "hd", "ssd", "armazenamento", "espaco", "storage"],
    ["temperatura", "temp", "calor", "aquecimento"],
    ["desligar", "desliga", "desligue", "desligamento", "shutdown", "apagar o pc"],
    ["reiniciar", "reinicia", "reinicie", "reboot", "restart"],
    ["bloquear", "bloqueia", "bloqueie", "lock", "travar"],
    ["suspender", "suspende", "suspensao", "hibernar", "dormir", "sleep"],
    ["volume", "som", "audio", "barulho"],
    ["aumentar", "aumenta", "aumente", "subir", "sobe", "mais alto"],
    ["diminuir", "diminui", "diminua", "abaixar", "abaixa", "baixar", "menos alto"],
    ["silenciar", "silencia", "mudo", "muta", "mutar", "sem som", "silencio"],
    ["lembrar", "lembrete", "lembretes", "lembre", "lembra", "aviso", "alarme", "alerta"],
    ["tarefa", "tarefas", "afazer", "afazeres", "todo", "todos", "pendencia", "pendencias"],
    ["anotar", "anote", "anota", "anotacao", "anotacoes", "anotar que"],
    ["nota", "notas"],
    ["memorizar", "memorize", "memoriza", "lembrar que", "lembre-se", "lembre se", "grave",
     "gravar", "guarde", "guarda", "registre", "registrar", "salve", "salva"],
    ["esquecer", "esqueca", "esqueca-se", "apagar da memoria", "remover da memoria", "delete"],
    ["rotina", "rotinas", "automacao"],
    ["objetivo", "objetivos", "meta", "metas"],
    ["horas", "hora", "que horas", "horario"],
    ["hoje", "agora"],
    ["amanha", "dia seguinte"],
    ["agenda", "compromissos", "agendamentos"],
    ["pesquisar", "pesquisa", "procurar", "procura", "buscar", "busca", "encontrar",
     "encontra", "localizar", "localiza", "onde esta"],
    ["organizar", "organiza", "organize", "arrumar", "arruma", "arrume", "separar", "separa"],
    ["duplicados", "duplicado", "repetidos", "iguais"],
    ["grandes", "pesados", "maiores", "arquivos grandes"],
    ["minimizar", "minimiza", "minimize", "recolher", "recolhe"],
    ["maximizar", "maximiza", "maximize", "tela cheia", "expandir"],
    ["trocar", "troca", "troque", "alternar", "alterna", "mudar de janela", "mude"],
    ["processos", "processo", "rodando", "executando"],
    ["criar", "cria", "crie", "novo", "nova", "fazer", "faz", "faca"],
    ["renomear", "renomeia", "renomeie", "mudar o nome", "trocar o nome"],
    ["mover", "move", "mova", "transferir", "transfere", "levar", "leva"],
    ["copiar", "copia", "copie", "duplicar", "duplica", "backup"],
    ["excluir", "exclui", "exclua", "apagar", "apaga", "apague", "remover", "remove", "remova"],
    ["temporizador", "cronometro", "contagem", "timer"],
    ["minutos", "minuto", "min"],
    ["segundos", "segundo", "seg"],
    ["ajuda", "ajudar", "ajude", "socorro", "help", "comandos", "o que voce faz",
     "o que voce pode fazer", "capacidades", "funcoes"],
    ["piada", "piadas", "engracado", "humor", "conta uma piada", "me faz rir"],
    ["opiniao", "acha", "achas", "pensa", "recomenda", "recomendacao", "conselho", "sugestao",
     "vale a pena", "devo", "deveria"],
    ["comparar", "compara", "compare", "diferenca", "versus", "vs"],
    ["planejar", "planeja", "planejamento", "plano", "organizar meus objetivos", "passo a passo"],
    ["explicar", "explica", "explique", "como funciona", "me ensina", "ensina"],
    ["certo", "correto", "certo?", "estou certo", "faz sentido", "concorda"],
    ["previsao", "clima", "tempo la fora", "vai chover", "temperatura ambiente"],
    ["nome", "me chamo", "me chame", "pode me chamar"],
    ["iniciar com windows", "inicializacao", "iniciar junto", "abrir junto com windows",
     "autostart", "boot"],
    ["microfone", "mic", "escuta", "escutando"],
    ["voz", "falar", "fala", "tts", "sintese"],
    ["agradecer", "obrigado", "obrigada", "valeu", "agradecido", "grato"],
    ["repetir", "repete", "repita", "repeti", "repete por favor"],
    ["saber", "sabe", "sabem", "saberia", "conhece"],
    ["tchau", "adeus", "ate logo", "ate mais", "boa noite", "encerrar sessao", "sair"],
    ["cancelar", "cancela", "cancele", "parar", "pare", "chega", "abortar", "aborta"],
]

_CANON: dict[str, str] = {}
for group in SYNONYMS:
    canonical = group[0]
    for word in group:
        _CANON.setdefault(word, canonical)

# Palavras que não trazem informação de intenção.
FILLERS = {
    "jarvis", "por", "favor", "pode", "poderia", "voce", "vc", "me", "mim", "pra", "para",
    "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das", "no", "na", "nos",
    "nas", "em", "e", "ai", "aí", "la", "lá", "agora", "ja", "já", "so", "só", "que", "se",
    "tem", "teria", "gostaria", "quero", "queria", "quer", "consigo", "consegue", "pode",
    "sim", "nao", "não", "ok", "okay", "beleza", "entao", "então", "bem", "tipo", "coisa",
    "arquivo", "estou", "esta", "está", "ser", "esta", "meu", "minha", "seu", "sua",
}

ABBREVIATIONS = {
    "vc": "voce", "vcs": "voces", "pq": "porque", "q": "que", "tb": "tambem", "tbm": "tambem",
    "hj": "hoje", "amnh": "amanha", "hrs": "horas", "hr": "hora", "mins": "minutos",
    "min": "minutos", "seg": "segundos", "tt": "tarefa", "pc": "computador", "ngm": "ninguem",
    "blz": "beleza", "vlw": "valeu", "obg": "obrigado", "pfv": "por favor", "pf": "por favor",
}


def strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def normalize(text: str, expand_synonyms: bool = True, remove_fillers: bool = False) -> str:
    """Minúsculas, sem acentos, sem pontuação, com abreviações expandidas."""
    if not text:
        return ""
    text = text.lower().replace("j.a.r.v.i.s", "jarvis").replace("j.a.r.v.i.s.", "jarvis")
    text = strip_accents(text)
    text = text.replace("-", " ")
    text = re.sub(r"[^\w\s:/.]", " ", text)
    text = re.sub(r"(?<!\d):|:(?!\d)", " ", text)   # "isso:" -> "isso", mas "19:30" intacto
    text = re.sub(r"\s+", " ", text).strip()
    words = []
    for word in text.split():
        word = ABBREVIATIONS.get(word, word)
        words.append(word)
    text = " ".join(words)

    # horas coladas: "23h" -> "23 horas", "19h30" -> "19:30"
    text = re.sub(r"\b(\d{1,2})h(\d{2})\b", r"\1:\2", text)
    text = re.sub(r"\b(\d{1,2})h\b", r"\1 horas", text)

    if expand_synonyms:
        text = " ".join(_CANON.get(w, w) for w in text.split())
    if remove_fillers:
        text = " ".join(w for w in text.split() if w not in FILLERS)
    return text.strip()


def words_to_numbers(text: str) -> str:
    """Converte números escritos em dígitos (até noventa e nove)."""
    tokens = text.split()
    result: list[str] = []
    for i, token in enumerate(tokens):
        value = UNITS.get(token)
        if value is None:
            result.append(token)
            continue
        # "vinte e dois" -> 22
        if i + 2 < len(tokens) and tokens[i + 1] == "e" and tokens[i + 2] in UNITS:
            nxt = UNITS[tokens[i + 2]]
            if value >= 20 and nxt < 10:
                result.append(str(value + nxt))
                tokens[i + 2] = ""
                tokens[i + 1] = ""
                continue
        result.append(str(value))
    return " ".join(w for w in result if w)


def tokens(text: str) -> list[str]:
    return [tok for tok in normalize(text).split() if tok]


def similarity(a: str, b: str) -> float:
    """Similaridade simples (para tolerar erros de pronúncia do reconhecedor)."""
    from difflib import SequenceMatcher

    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    # atalho seguro: radical quase idêntico ("processo" x "processos").
    # Substring frouxa fazia "tempo" casar com "temporizador" e "nota" com "anotar".
    if min(len(a), len(b)) >= 5 and abs(len(a) - len(b)) <= 2:
        if a in b or b in a:
            return 0.93
    return SequenceMatcher(None, a, b).ratio()
