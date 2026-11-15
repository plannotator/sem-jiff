# Reads API keys for the harness scripts that ask a decision model (clef.py, claims-check.py, probes.py).
# The keys live in a KEY=value file outside the repository; its path comes from the SEM_DIFF_KEYS_FILE
# environment variable. There is no default location. Names read: TYPESAFE_API_KEY (Jev), and
# CLOUDFLARE_ACCOUNT_ID with CLOUDFLARE_API_TOKEN (Clef; without them, clef.py borrows Wrangler's login).
import os, sys

def keys_file():
    path = os.environ.get('SEM_DIFF_KEYS_FILE')
    if not path:
        return None
    if not os.path.isfile(path):
        sys.exit(f'SEM_DIFF_KEYS_FILE: no such file: {path}')
    return path

def load_keys():
    path = keys_file()
    keys = {}
    if path:
        for line in open(path):
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                keys[k.strip()] = v.strip().strip('"\'')
    return keys

def require(name):
    value = load_keys().get(name)
    if not value:
        sys.exit(f'{name} not found: set SEM_DIFF_KEYS_FILE to a KEY=value file that has it')
    return value
