"""Comandos de arquivos — sempre com pré-visualização antes de alterar em massa."""
from __future__ import annotations

import os
import re
from pathlib import Path

from ..core.response import Response
from ..nlu import extract
from ..nlu.engine import command
from ..security.permissions import SecurityError
from ..system import files as filetools
from .base import Context
from .helpers import ask_confirmation, err, human_list, ok


def _roots(ctx: Context) -> list[Path]:
    roots = ctx.permissions.allowed_roots()
    home = Path.home()
    extra = [home / "Downloads", home / "Documents", home / "Desktop"]
    for path in extra:
        if path.exists() and path not in roots:
            roots.append(path)
    return roots


def _find_file(ctx: Context, term: str) -> Path | None:
    term = term.strip().strip("\"'")
    if not term:
        return None
    candidate = Path(os.path.expanduser(term))
    if candidate.exists():
        return candidate
    for root in _roots(ctx):
        try:
            results = filetools.search(root, term, limit=1, max_depth=5)
        except Exception:
            continue
        if results:
            return results[0]
    return None


def _name_after(text: str, markers: list[str]) -> str | None:
    pattern = r"(?i)(?:" + "|".join(markers) + r")\s+([^,;]{2,80})"
    match = re.search(pattern, text)
    if not match:
        return None
    return match.group(1).strip().strip("\"'").strip()


# ------------------------------------------------------------------- leitura --
@command("file.open",
         must=[["abrir", "abre"], ["arquivo", "planilha", "pdf", "documento", "foto", "imagem",
                                   "video", "música", "musica"]],
         optional=[["o", "a", "meu", "minha"]],
         category="arquivos",
         description="Abre um arquivo existente com o programa padrão",
         examples=["Abre o arquivo relatório.pdf", "Abre a planilha orçamento.xlsx"],
         priority=4)
def open_file(ctx: Context):
    from ..system import platform as sysplat

    name = extract.quoted(ctx.text) or extract.after_marker(
        ctx.text, ["abre o arquivo", "abrir o arquivo", "abre a planilha", "abre o documento",
                   "abre a foto", "abre o vídeo", "abre o video", "abre", "abrir"]) or ""
    name = re.sub(r"(?i)^(?:o|a|os|as|meu|minha)\s+", "", name.strip())
    name = re.sub(r"(?i)\b(?:em|no|na|de|do|da)\s+(?:documentos|downloads|imagens|músicas|musicas|"
                  r"vídeos|videos|área de trabalho|area de trabalho)\b", "", name)
    name = name.strip(" .,!?")
    if not name:
        return ok(ctx, "Qual arquivo devo abrir? Diga o nome, por exemplo “abre o arquivo orçamento.xlsx”.")

    encontrados: list[Path] = []
    for root in _roots(ctx):
        try:
            encontrados.extend(filetools.search(root, name, limit=6, max_depth=5))
        except Exception:
            continue
    arquivos = [p for p in encontrados if p.is_file()]
    pastas = [p for p in encontrados if p.is_dir()]
    candidatos = arquivos or pastas
    if not candidatos:
        return err(ctx, f"Não encontrei “{name}” nas suas pastas. Diga “pesquisa arquivos com nome {name}” "
                        "que eu procuro em outros lugares.")
    if len(candidatos) > 1:
        nomes = human_list([f"{p.name} ({p.parent.name})" for p in candidatos[:5]])
        return ok(ctx, f"Encontrei mais de um: {nomes}. Seja mais específico, por favor.",
                  candidates=[str(p) for p in candidatos[:8]])
    alvo = candidatos[0]
    try:
        safe = ctx.permissions.check_path(alvo)
    except Exception as exc:
        return err(ctx, str(exc))
    success, message = sysplat.open_path(safe)
    if not success:
        return err(ctx, message)
    ctx.assistant.audit.record("file.open", str(alvo), level=1)
    return ok(ctx, f"Abri {alvo.name}.", path=str(alvo))


@command("file.search",
         must=[["pesquisar"], ["arquivo", "pasta", "onde", "computador"]],
         extra_patterns=[{"must": [["pesquisar", "localizar"]]},
                         {"must": [["onde"], ["esta"]]}],
         optional=[["arquivo", "pasta", "computador"]],
         category="arquivos",
         description="Procura arquivos e pastas pelo nome",
         examples=["Procura o arquivo relatório.pdf", "Onde está a pasta projetos?"],
         priority=3)
def search_files(ctx: Context):
    term = extract.quoted(ctx.text) or _name_after(
        ctx.text, ["procure", "procura", "pesquise", "pesquisa", "busque", "busca",
                   "encontre", "encontra", "localize", "localiza", "onde está", "onde esta"]) \
        or ctx.residual()
    term = " ".join(w for w in term.replace("o arquivo", "").replace("a pasta", "").split()
                    if w not in ("por", "favor", "no", "na", "meu", "minha", "computador"))
    if not term:
        return ok(ctx, "O que devo procurar? Diga o nome do arquivo ou da pasta.")
    found: list[Path] = []
    for root in _roots(ctx):
        try:
            found.extend(filetools.search(root, term, limit=12, max_depth=5))
        except Exception:
            continue
        if len(found) >= 12:
            break
    if not found:
        return ok(ctx, f"Não encontrei nada com “{term}” nas pastas autorizadas. "
                       "Se o arquivo estiver em outro local, informe o caminho completo.")
    listing = "; ".join(str(path) for path in found[:8])
    return ok(ctx, f"Encontrei {len(found)} resultado(s): {listing}.", results=[str(p) for p in found])


@command("file.large",
         must=[["grandes", "pesados"], ["arquivo", "pesados"]],
         extra_patterns=[{"must": [["maior"], ["arquivo"]]}],
         optional=[["arquivo", "maiores", "computador"]],
         extract_names=["number"],
         category="arquivos",
         description="Lista os maiores arquivos das pastas autorizadas",
         examples=["Quais são os arquivos grandes?"],
         priority=4)
def large_files(ctx: Context):
    min_mb = ctx.slots.get("number") or 100
    results: list[dict] = []
    for root in _roots(ctx)[:3]:
        try:
            results.extend(filetools.find_large(root, min_mb=min_mb, limit=10))
        except Exception:
            continue
    results.sort(key=lambda item: item["size_mb"], reverse=True)
    results = results[:10]
    if not results:
        return ok(ctx, f"Não encontrei arquivos acima de {min_mb} MB.")
    lines = [f"{Path(item['path']).name} — {item['size_mb']} MB" for item in results]
    return ok(ctx, f"Maiores arquivos encontrados: {human_list(lines, 8)}.", files=results)


@command("file.duplicates",
         must=[["duplicados"], ["arquivo"]],
         optional=[["arquivo", "pesquisar"]],
         category="arquivos",
         description="Procura arquivos duplicados por conteúdo",
         examples=["Encontra os arquivos duplicados"],
         priority=4)
def duplicates(ctx: Context):
    groups: list[list[Path]] = []
    for root in _roots(ctx)[:2]:
        try:
            groups.extend(filetools.find_duplicates(root, min_size=10240, limit=10))
        except Exception:
            continue
    if not groups:
        return ok(ctx, "Não encontrei duplicados nas pastas autorizadas. Bom sinal.")
    total_mb = 0
    samples = []
    for group in groups[:3]:
        try:
            total_mb += group[0].stat().st_size / 1048576 * (len(group) - 1)
        except OSError:
            pass
        samples.append(group[0].name)
    text = (f"Encontrei {len(groups)} grupo(s) de arquivos idênticos — cerca de "
            f"{total_mb:.0f} MB recuperáveis. Exemplos: {human_list(samples, 3)}. "
            "Não apaguei nada. Se quiser, posso preparar uma lista para o senhor revisar.")
    return ok(ctx, text, groups=[[str(p) for p in group] for group in groups])


# ---------------------------------------------------------------- alterações --
def _preview_plan(ctx: Context, plan: filetools.Plan, description: str, level: int = 2):
    if not plan.actions:
        notes = " ".join(plan.notes) or "Nada a fazer."
        return ok(ctx, notes)

    def execute():
        success, message, details = plan.execute()
        ctx.assistant.audit.record("files.plan", f"{plan.title} — {message}", level=level,
                                   result="ok" if success else "parcial", confirmed=True)
        if success:
            return ok(ctx, f"{message} — {plan.title}.", details=details)
        return err(ctx, message, details=details)

    preview = plan.preview()
    if ctx.dry_run:
        return Response(reply=f"Vou {plan.title.lower()} — {plan.count} item(ns).",
                        intent=ctx.intent, source=ctx.source, data={"preview": preview})
    return ask_confirmation(ctx, description.rstrip(" ."), level, execute, preview)


@command("file.organize",
         must=[["organizar"]],
         optional=[["pasta", "downloads", "arquivo", "por", "categoria"]],
         level=2,
         category="arquivos",
         description="Organiza uma pasta por categoria de arquivo",
         examples=["Jarvis, organize os arquivos da minha pasta de downloads"],
         priority=3,
         gate=False)
def organize(ctx: Context):
    folders = ctx.config.get("system.folders", {}) or {}
    target = filetools.resolve_folder(ctx.clean, folders, ctx.permissions)
    if target is None or not target.exists():
        return ok(ctx, "Qual pasta devo organizar? Por exemplo: “organize a pasta de downloads”.")
    try:
        target = ctx.permissions.check_path(target, write=True)
    except SecurityError as exc:
        return err(ctx, str(exc))
    plan = filetools.build_organize_plan(target, ctx.permissions)
    if not plan.actions:
        return ok(ctx, f"A pasta {target.name} já está organizada por categoria.")
    categories = sorted({action.target.parent.name for action in plan.actions if action.target})
    summary = (f"Encontrei {plan.count} arquivo(s) soltos em {target.name} "
               f"({plan.total_bytes / 1048576:.1f} MB) e vou separá-los nas pastas: "
               f"{human_list(categories, 6)}. Nada será apagado.")
    return _preview_plan(ctx, plan, summary, level=2)


@command("file.mkdir",
         must=[["criar"], ["pasta", "diretorio"]],
         level=2,
         category="arquivos",
         description="Cria uma pasta",
         examples=["Cria uma pasta chamada Projetos em Documentos"],
         priority=4,
         gate=False)
def make_folder(ctx: Context):
    name = extract.quoted(ctx.text) or _name_after(
        ctx.text, ["chamada", "chamado", "com o nome", "nome"]) or ctx.residual()
    name = re.sub(r"(?i)\b(em|no|na|dentro de)\b.*$", "", name).strip()
    if not name:
        return ok(ctx, "Qual nome devo dar à pasta? Exemplo: “cria uma pasta chamada Projetos”.")
    base_text = ctx.clean
    folders = ctx.config.get("system.folders", {}) or {}
    base = filetools.resolve_folder(base_text, folders, ctx.permissions) or Path.home()
    target = base / name

    try:
        target = ctx.permissions.check_path(target, write=True)
    except SecurityError as exc:
        return err(ctx, str(exc))

    def run():
        try:
            target.mkdir(parents=True, exist_ok=True)
            ctx.assistant.audit.record("file.mkdir", str(target), level=2, confirmed=True)
            return ok(ctx, f"Pasta criada em {target}.", path=str(target))
        except Exception as exc:
            return err(ctx, f"não consegui criar a pasta: {exc}")

    if ctx.dry_run:
        return Response(reply=f"Vou criar a pasta {target}.", intent=ctx.intent, source=ctx.source)
    return ask_confirmation(ctx, f"criar a pasta {target}", 2, run, preview={"pasta": str(target)})


@command("file.rename",
         must=[["renomear"]],
         level=2,
         category="arquivos",
         description="Renomeia um arquivo ou pasta",
         examples=["Renomeia o arquivo relatorio.txt para final.txt"],
         priority=4,
         gate=False)
def rename(ctx: Context):
    quoted = re.findall(r"[\"“']([^\"”']+)[\"”']", ctx.text)
    match = re.search(r"(?i)(?:renomear|renomeia|renomeie|mudar o nome de|trocar o nome de)\s+(.+?)\s+"
                      r"(?:para|por|como)\s+(.+)", ctx.text)
    if quoted and len(quoted) >= 2:
        old, new = quoted[0], quoted[1]
    elif match:
        old, new = match.group(1).strip(), match.group(2).strip(" .\"'")
    else:
        return ok(ctx, "Diga o arquivo e o novo nome. Exemplo: “renomeia relatorio.txt para final.txt”.")
    source = _find_file(ctx, old)
    if not source:
        return err(ctx, f"não encontrei “{old}”")
    try:
        source = ctx.permissions.check_path(source, write=True)
    except SecurityError as exc:
        return err(ctx, str(exc))
    target = source.parent / new

    def run():
        try:
            if target.exists():
                return err(ctx, f"já existe um item chamado “{new}” nessa pasta")
            source.rename(target)
            ctx.assistant.audit.record("file.rename", f"{source} -> {target}", level=2, confirmed=True)
            return ok(ctx, f"Renomeado para {new}.", path=str(target))
        except Exception as exc:
            return err(ctx, f"não consegui renomear: {exc}")

    if ctx.dry_run:
        return Response(reply=f"Vou renomear {source.name} para {new}.", intent=ctx.intent,
                        source=ctx.source)
    return ask_confirmation(ctx, f"renomear “{source.name}” para “{new}”", 2, run,
                            preview={"de": str(source), "para": str(target)})


@command("file.transfer",
         must=[["mover", "copiar"]],
         level=2,
         category="arquivos",
         description="Move ou copia arquivos e pastas",
         examples=["Copia o relatorio.pdf para Documentos", "Move a pasta projetos para o desktop"],
         priority=4,
         gate=False)
def transfer(ctx: Context):
    kind = "mover" if "mover" in ctx.norm else "copiar"
    quoted = re.findall(r"[\"“']([^\"”']+)[\"”']", ctx.text)
    match = re.search(r"(?i)(?:mover|move|mova|transferir|transfere|copiar|copia|copie)\s+(.+?)\s+"
                      r"(?:para|pra|dentro de|em)\s+(.+)", ctx.text)
    if quoted and len(quoted) >= 2:
        old, destination = quoted[0], quoted[1]
    elif match:
        old, destination = match.group(1).strip(), match.group(2).strip(" .")
    else:
        return ok(ctx, f"Diga o que {kind} e para onde. Exemplo: “{kind} relatorio.pdf para Documentos”.")
    source = _find_file(ctx, old)
    if not source:
        return err(ctx, f"não encontrei “{old}”")
    folders = ctx.config.get("system.folders", {}) or {}
    target_dir = filetools.resolve_folder(destination, folders, ctx.permissions)
    if not target_dir:
        target_dir = Path(os.path.expanduser(destination))
    try:
        source = ctx.permissions.check_path(source, write=True)
        target_dir = ctx.permissions.check_path(target_dir, write=True)
    except SecurityError as exc:
        return err(ctx, str(exc))
    if not target_dir.exists():
        return err(ctx, f"a pasta de destino não existe: {target_dir}")
    plan = filetools.Plan(title=f"{kind.capitalize()} {source.name}")
    plan.actions.append(filetools.FileAction(kind, source, target_dir / source.name))
    try:
        plan.total_bytes = source.stat().st_size
    except OSError:
        pass
    return _preview_plan(ctx, plan, f"{kind} {source.name} para {target_dir}", level=2)


@command("file.delete",
         must=[["excluir"]],
         optional=[["arquivo", "pasta", "definitivo", "permanente"]],
         level=3,
         category="arquivos",
         description="Exclui um arquivo (com confirmação obrigatória)",
         examples=["Exclui o arquivo temporario.txt"],
         priority=2,
         gate=False)
def delete(ctx: Context):
    term = extract.quoted(ctx.text) or _name_after(
        ctx.text, ["excluir", "exclua", "apagar", "apague", "remover", "remova"]) or ctx.residual()
    term = re.sub(r"(?i)\b(o|a|os|as)\s+(arquivo|pasta)\b", "", term).strip()
    if not term:
        return ok(ctx, "Qual item devo excluir? Informe o nome ou o caminho completo.")
    source = _find_file(ctx, term)
    if not source:
        return err(ctx, f"não encontrei “{term}”")
    try:
        source = ctx.permissions.check_path(source, write=True)
    except SecurityError as exc:
        return err(ctx, str(exc))

    def run():
        plan = filetools.Plan(title=f"Excluir {source.name}")
        plan.actions.append(filetools.FileAction("excluir", source))
        success, message, details = plan.execute()
        ctx.assistant.audit.record("file.delete", str(source), level=3,
                                   result="ok" if success else "erro", confirmed=True)
        if success:
            return ok(ctx, f"{source.name} foi excluído.", path=str(source))
        return err(ctx, message)

    if ctx.dry_run:
        return Response(reply=f"Vou excluir {source}.", intent=ctx.intent, source=ctx.source)
    return ask_confirmation(ctx, f"excluir permanentemente “{source}”", 3, run,
                            preview={"arquivo": str(source),
                                     "observação": "a exclusão vai para a lixeira quando disponível"})


@command("file.list",
         must=[["listar", "mostrar"], ["pasta", "arquivo", "conteudo"]],
         category="arquivos",
         description="Lista o conteúdo de uma pasta",
         examples=["Lista os arquivos da pasta downloads"],
         priority=3)
def list_files(ctx: Context):
    folders = ctx.config.get("system.folders", {}) or {}
    target = filetools.resolve_folder(ctx.clean, folders, ctx.permissions) or Path.home()
    data = filetools.list_dir(target, limit=25)
    if not data["entries"]:
        return ok(ctx, f"A pasta {target} está vazia ou não pôde ser lida.", path=str(target))
    names = [entry["name"] + ("/" if entry["is_dir"] else "") for entry in data["entries"]]
    return ok(ctx, f"Conteúdo de {target.name}: {human_list(names, 10)}.", path=str(target),
              entries=data["entries"])
