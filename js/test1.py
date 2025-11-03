import time, os

def benchmark_loops():
    s = 0
    for i in range(1_000_000):
        s += i
    return s

def benchmark_file_rw():
    filename = "py_temp.txt"
    with open(filename, "w") as f:
        for i in range(1000):
            f.write(f"Line {i}\n")
    with open(filename, "r") as f:
        lines = f.readlines()
    os.remove(filename)
    return len(lines)

def benchmark_arrays_objects():
    arr = [i for i in range(100000)]
    obj = {str(i): i for i in range(100000)}
    return arr[-1], obj["99999"]

if __name__ == "__main__":
    start = time.time()
    benchmark_loops()
    benchmark_file_rw()
    benchmark_arrays_objects()
    end = time.time()
    print("{return_code:0}")
    #print(f"✅ Python Test1 finished in {round((end-start)*1000,2)} ms")