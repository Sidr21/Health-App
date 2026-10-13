"""Minimal FIT encoder for synthetic test files (file_id + record messages only).

Real FIT files are personal data and cannot be committed; this writes valid files with
made-up streams so the parser is tested against the real binary format (header, definition
and data messages, CRC).
"""

from __future__ import annotations

import struct
from datetime import UTC, datetime

FIT_EPOCH = 631065600  # 1989-12-31T00:00:00Z
_CRC_TABLE = [
    0x0000,
    0xCC01,
    0xD801,
    0x1400,
    0xF001,
    0x3C00,
    0x2800,
    0xE401,
    0xA001,
    0x6C00,
    0x7800,
    0xB401,
    0x5000,
    0x9C01,
    0x8801,
    0x4400,
]


def crc16(data: bytes, crc: int = 0) -> int:
    for byte in data:
        tmp = _CRC_TABLE[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TABLE[byte & 0xF]
        tmp = _CRC_TABLE[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TABLE[(byte >> 4) & 0xF]
    return crc


def _fit_ts(dt: datetime) -> int:
    return int(dt.replace(tzinfo=dt.tzinfo or UTC).timestamp()) - FIT_EPOCH


# (field number, size, base type, struct code)
_FILE_ID = [(0, 1, 0x00, "B"), (1, 2, 0x84, "H"), (4, 4, 0x86, "I")]
_RECORD = [
    (253, 4, 0x86, "I"),  # timestamp
    (3, 1, 0x02, "B"),  # heart_rate bpm
    (5, 4, 0x86, "I"),  # distance, 1/100 m
    (6, 2, 0x84, "H"),  # speed, 1/1000 m/s
    (4, 1, 0x02, "B"),  # cadence
    (7, 2, 0x84, "H"),  # power W
    (2, 2, 0x84, "H"),  # altitude, (m + 500) * 5
]


def _definition(local: int, global_num: int, fields) -> bytes:
    out = struct.pack("<BBBHB", 0x40 | local, 0, 0, global_num, len(fields))
    for num, size, base, _ in fields:
        out += struct.pack("<BBB", num, size, base)
    return out


def _data(local: int, fields, values) -> bytes:
    return bytes([local]) + b"".join(
        struct.pack("<" + code, v) for (_, _, _, code), v in zip(fields, values, strict=True)
    )


def write_fit(start: datetime, rows: list[dict]) -> bytes:
    """rows: dicts with t (s from start), hr, distance_m, speed_mps, cadence, power_w, alt_m."""
    body = _definition(0, 0, _FILE_ID) + _data(0, _FILE_ID, [4, 294, _fit_ts(start)])
    body += _definition(1, 20, _RECORD)
    for r in rows:
        body += _data(
            1,
            _RECORD,
            [
                _fit_ts(start) + int(r["t"]),
                int(r.get("hr", 0xFF)),
                int(round(r.get("distance_m", 0) * 100)),
                int(round(r.get("speed_mps", 0) * 1000)),
                int(r.get("cadence", 0)),
                int(r.get("power_w", 0)),
                int(round((r.get("alt_m", 0) + 500) * 5)),
            ],
        )
    header = struct.pack("<BBHI4s", 14, 0x20, 2132, len(body), b".FIT")
    header += struct.pack("<H", crc16(header))
    blob = header + body
    return blob + struct.pack("<H", crc16(blob))


def synthetic_run(start: datetime, minutes: int = 30, cooldown_s: int = 120) -> bytes:
    """A made-up steady run that builds to a hard finish, then a walking cool-down."""
    rows, dist = [], 0.0
    total = minutes * 60
    for t in range(0, total + cooldown_s, 1):
        if t < total:
            frac = t / total
            hr = 120 + 55 * min(1.0, frac * 1.3)  # 120 -> 175 bpm
            speed = 2.8 + 0.6 * frac
        else:
            k = t - total
            hr = 175 - 40 * (1 - 2.718 ** (-k / 25))  # fast drop after the effort
            speed = 1.3
        dist += speed
        rows.append(
            {
                "t": t,
                "hr": round(hr),
                "distance_m": dist,
                "speed_mps": speed,
                "cadence": 82,
                "power_w": 180 if t < total else 60,
                "alt_m": 10 + (t % 300) / 30,
            }
        )
    return write_fit(start, rows)
