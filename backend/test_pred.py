import json, urllib.request
url = 'http://127.0.0.1:8000/api/predictions'
payload = {'user': 'default@sanjeevni.app'}
data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as resp:
        print('Status:', resp.status)
        print('Response:', resp.read().decode())
except Exception as e:
    print('Error:', e)
