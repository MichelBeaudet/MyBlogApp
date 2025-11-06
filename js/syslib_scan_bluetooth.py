#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
syslib_scan_bluetooth.py — robuste toutes versions de Bleak
- Pas d'appairage, scan passif BLE avec callback.
- JSON **toujours valide** sur stdout (liste ou {"error":...}).
- Récupère name/address/RSSI/services/manufacturer quand dispo.
"""

import argparse
import asyncio
import json
import sys

def jprint(obj, code=0):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(code)

try:
    from bleak import BleakScanner
except Exception as e:
    jprint({"error": f"Bleak import failed: {e}"}, code=1)


def manufacturer_labels(manu_dict):
    KNOWN = {0x004C: "Apple", 0x0006: "Microsoft", 0x0131: "Google", 0x0075: "Samsung"}
    out = []
    for mid in (manu_dict or {}).keys():
        out.append(f"{KNOWN.get(mid)} (0x{mid:04x})" if KNOWN.get(mid) else f"0x{mid:04x}")
    return out


async def do_scan(seconds: float):
    """
    Collecte via detection_callback pour éviter les soucis de
    retour (tuple/dict) de discover(return_adv=True) selon les versions.
    """
    found = {}  # address -> entry

    def on_advert(device, adv):
        # entry existante ou défaut
        entry = found.get(device.address, {
            "name": "(unknown)",
            "address": device.address or "",
            "rssi": None,
            "uuids": [],
            "manufacturer": []
        })

        # name: priorité à adv.local_name, sinon device.name
        name = getattr(adv, "local_name", None) or getattr(device, "name", None) or entry["name"]
        entry["name"] = name or "(unknown)"

        # rssi: prend la valeur la plus récente (ou la plus forte)
        rssi = getattr(adv, "rssi", None)
        if rssi is not None:
            if entry["rssi"] is None or rssi > entry["rssi"]:
                entry["rssi"] = rssi

        # services: fusionne en set
        uuids = list(getattr(adv, "service_uuids", []) or [])
        if uuids:
            entry["uuids"] = sorted(set(entry.get("uuids", []) + uuids))

        # manufacturer: fusionne en set libellisé
        labels = manufacturer_labels(getattr(adv, "manufacturer_data", {}) or {})
        if labels:
            entry["manufacturer"] = sorted(set(entry.get("manufacturer", []) + labels))

        found[device.address] = entry

    # Scanner avec callback
    scanner = BleakScanner(detection_callback=on_advert)
    await scanner.start()
    try:
        await asyncio.sleep(seconds)
    finally:
        await scanner.stop()

    # Fallback: si rien reçu via callback, essayer discover() simple
    if not found:
        try:
            devices = await BleakScanner.discover(timeout=seconds)
            for dev in devices:
                found[dev.address] = {
                    "name": getattr(dev, "name", None) or "(unknown)",
                    "address": getattr(dev, "address", "") or "",
                    "rssi": getattr(dev, "rssi", None),
                    "uuids": [],
                    "manufacturer": []
                }
        except Exception as e:
            # On renverra l'erreur proprement
            raise e

    return list(found.values())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--duration", type=float, default=8.0)
    args = p.parse_args()
    try:
        res = asyncio.run(do_scan(args.duration))
        jprint(res, code=0)  # liste (peut être vide)
    except Exception as e:
        jprint({"error": str(e)}, code=2)


if __name__ == "__main__":
    main()
