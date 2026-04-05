#!/usr/bin/env python3
"""Emergency script to reset/create admin user password in SQLite DB.

Usage:
  python3 reset_admin_password.py
  python3 reset_admin_password.py --db /path/to/app.db
  python3 reset_admin_password.py --password 'YourStrongPass'
"""

import argparse
import hashlib
import os
import secrets
import sqlite3
import string
import sys
from datetime import datetime, timezone
from typing import Optional, Tuple


def detect_db_path(explicit_db: str = "") -> str:
    candidates = []

    if explicit_db:
        candidates.append(os.path.abspath(os.path.expanduser(explicit_db)))

    env_db_path = (os.environ.get("APP_DB_PATH") or "").strip()
    if env_db_path:
        candidates.append(os.path.abspath(os.path.expanduser(env_db_path)))

    base_dir = os.path.abspath(os.path.dirname(__file__))
    app_data_dir = (os.environ.get("APP_DATA_DIR") or "").strip()
    if app_data_dir:
        candidates.append(os.path.abspath(os.path.join(os.path.expanduser(app_data_dir), "app.db")))

    candidates.extend(
        [
            os.path.join(base_dir, "app_data", "app.db"),
            os.path.join(base_dir, "instance", "app.db"),
            os.path.join(base_dir, "app.db"),
        ]
    )

    seen = set()
    for path in candidates:
        if not path:
            continue
        norm = os.path.abspath(path)
        if norm in seen:
            continue
        seen.add(norm)
        if os.path.exists(norm):
            return norm

    raise FileNotFoundError(
        "未找到数据库文件。请设置 APP_DB_PATH，或使用 --db 显式指定数据库路径。"
    )


def detect_user_table(conn: sqlite3.Connection) -> Optional[str]:
    cur = conn.cursor()
    for table_name in ("users", "user"):
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table_name,),
        )
        if cur.fetchone():
            return table_name
    return None


def make_password_hash(password: str) -> str:
    try:
        from werkzeug.security import generate_password_hash

        return generate_password_hash(password)
    except Exception:
        salt_chars = string.ascii_letters + string.digits
        salt = "".join(secrets.choice(salt_chars) for _ in range(16))
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt.encode("utf-8"),
            n=32768,
            r=8,
            p=1,
            dklen=64,
            maxmem=64 * 1024 * 1024,
        ).hex()
        return f"scrypt:32768:8:1${salt}${digest}"


def reset_password(db_path: str, username: str, new_password: str) -> Tuple[bool, str]:
    conn = sqlite3.connect(db_path)
    try:
        table = detect_user_table(conn)
        if not table:
            raise RuntimeError(f"数据库没有 users/user 表: {db_path}")

        cur = conn.cursor()
        cur.execute(f"PRAGMA table_info({table})")
        columns = {row[1] for row in cur.fetchall()}

        required = {"username", "password_hash"}
        if not required.issubset(columns):
            raise RuntimeError(f"表 {table} 缺少必要字段: {required - columns}")

        password_hash = make_password_hash(new_password)

        cur.execute(f"SELECT id FROM {table} WHERE username=? LIMIT 1", (username,))
        exists = cur.fetchone() is not None

        if exists:
            update_cols = ["password_hash=?"]
            params = [password_hash]
            if "is_active" in columns:
                update_cols.append("is_active=1")
            if "last_login" in columns:
                update_cols.append("last_login=NULL")
            params.append(username)
            cur.execute(
                f"UPDATE {table} SET {', '.join(update_cols)} WHERE username=?",
                tuple(params),
            )
            action = "updated"
        else:
            insert_columns = ["username", "password_hash"]
            insert_values = [username, password_hash]
            placeholders = ["?", "?"]

            if "created_at" in columns:
                insert_columns.append("created_at")
                insert_values.append(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
                placeholders.append("?")
            if "is_active" in columns:
                insert_columns.append("is_active")
                insert_values.append(1)
                placeholders.append("?")

            cur.execute(
                f"INSERT INTO {table} ({', '.join(insert_columns)}) VALUES ({', '.join(placeholders)})",
                tuple(insert_values),
            )
            action = "created"

        conn.commit()
        return exists, action
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset/create admin password for this project")
    parser.add_argument("--db", default="", help="SQLite DB path, e.g. /path/to/app.db")
    parser.add_argument("--username", default="admin", help="username to reset (default: admin)")
    parser.add_argument("--password", default="", help="password to set (default: auto-generate)")
    args = parser.parse_args()

    username = (args.username or "admin").strip()
    if not username:
        print("ERROR: username 不能为空", file=sys.stderr)
        return 2

    password = (args.password or "").strip() or secrets.token_urlsafe(18)

    try:
        db_path = detect_db_path(args.db)
        existed, action = reset_password(db_path, username, password)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"username={username}")
    print(f"password={password}")
    print(f"db={db_path}")
    print(f"action={action}")
    print("note=请尽快登录后在系统内修改为你自己的长期密码")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
