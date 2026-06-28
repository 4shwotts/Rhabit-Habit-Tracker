import shutil
import os

def reset():
    base = os.path.dirname(os.path.abspath(__file__))
    seed = os.path.join(base, 'server', 'db', 'rhabit_seed.db')
    live = os.path.join(base, 'server', 'db', 'rhabit.db')
    shutil.copy2(seed, live)
    print("Database reset to seed state")

if __name__ == '__main__':
    reset()