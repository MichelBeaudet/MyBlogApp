import sys, json, os

def main(argv):
  if len(argv) != 7:
    print("Usage: myscript_py.py v1 v2 v3 v4 v5 output_path", file=sys.stderr)
    return 2
  try:
    v1, v2, v3, v4, v5 = map(float, argv[1:6])
    out_path = argv[6]
    product = v1 * v2 * v3 * v4 * v5
    data = {
      "inputs": [v1, v2, v3, v4, v5],
      "product": product
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
      json.dump(data, f, indent=2)
    print(json.dumps(data))
    return 0
  except Exception as e:
    print(str(e), file=sys.stderr)
    return 1

if __name__ == "__main__":
  sys.exit(main(sys.argv))
