#!/usr/bin/env python3
"""
snippet_gen.py
--------------
Ce script retourne sur la sortie standard un JSON {"code": "..."} utilisé par server.js.

Mode d'opération défini au début du fichier:
    mode = "random"  → choisir un bloc dans une liste interne
    mode = "scan"    → scanner un dossier de .py et choisir un bloc (def/class)
"""

import json, random, os, re

# --- CONFIGURATION ---
mode = "random"   # ← change à "scan" pour lire des fichiers .py
scan_folder = "snippets"  # dossier contenant des .py à analyser si mode = "scan"

# --- MODE 1 : BLOCS PRÉDÉFINIS ---
STATIC_SNIPPETS = [
    """def fib(n):
    a,b=0,1
    for _ in range(n):
        yield a
        a,b=b,a+b""",
    """class Stack:
    def __init__(self):
        self._data=[]
    def push(self,x):
        self._data.append(x)
    def pop(self):
        return self._data.pop()""",
    """from dataclasses import dataclass
@dataclass
class Point:
    x: float
    y: float
    def norm2(self):
        return self.x*self.x + self.y*self.y""",
    """try:
    1/0
except ZeroDivisionError:
    pass""",
]

# --- MODE 2 : EXTRACTION DE BLOCS À PARTIR DE FICHIERS ---
def extract_code_blocks(folder: str):
    """Retourne la liste de blocs 'def' ou 'class' trouvés dans les .py du dossier."""
    blocks = []
    pattern = re.compile(r'^(def |class )', re.M)
    for root, _, files in os.walk(folder):
        for f in files:
            if f.endswith(".py"):
                path = os.path.join(root, f)
                try:
                    with open(path, "r", encoding="utf-8") as fh:
                        content = fh.read()
                    parts = pattern.split(content)
                    # re.split garde les séparateurs, on reforme les blocs
                    for i in range(1, len(parts), 2):
                        block_type = parts[i].strip()
                        body = parts[i + 1].split("\n\n", 1)[0]
                        block = block_type + body
                        if block.strip():
                            blocks.append(block.strip())
                except Exception as e:
                    continue
    return blocks

# --- CHOIX DU MODE ---
if mode == "scan":
    snippets = extract_code_blocks(scan_folder)
    if not snippets:
        result = {"code": "# Aucun bloc trouvé dans le dossier"}
    else:
        result = {"code": random.choice(snippets)}
else:
    result = {"code": random.choice(STATIC_SNIPPETS)}

# --- SORTIE ---
print(json.dumps(result, ensure_ascii=False))
