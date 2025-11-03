import time

def benchmark_array_manip():
    arr = list(range(100000))
    arr = [x * 2 for x in arr if x % 2 == 0]
    arr.reverse()
    return sum(arr)

def benchmark_object_manip():
    obj = {str(i): i for i in range(50000)}
    for k in list(obj.keys())[:1000]:
        obj[k] *= 2
    return len(obj)

if __name__ == "__main__":
    start = time.time()
    benchmark_array_manip()
    benchmark_object_manip()
    end = time.time()
    print(f"✅ Python Test2 finished in {round((end-start)*1000,2)} ms")