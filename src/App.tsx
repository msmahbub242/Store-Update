import { useState, useEffect, useMemo } from 'react';
import { initAuth, googleSignIn, getAccessToken } from './auth';

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [needsAuth, setNeedsAuth] = useState(true);
  const [spreadsheetId, setSpreadsheetId] = useState('YOUR_SPREADSHEET_ID_HERE');
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    initAuth(
      (_, token) => {
        setNeedsAuth(false);
        fetchSheetData(token);
      },
      () => setNeedsAuth(true)
    );
  }, []);

  const handleGoogleSignIn = async () => {
    setLoginError(null);
    try {
      await googleSignIn();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setLoginError('Sign-in cancelled. Please try again.');
      } else {
        console.error(err);
        setLoginError('An error occurred during sign-in.');
      }
    }
  };

  const fetchSheetData = async (token: string) => {
    try {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:I100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await response.json();
      if (json.values && json.values.length > 0) {
        const headers = json.values[0];
        const rows = json.values.slice(1).map((row: any[]) => {
          return headers.reduce((obj: any, header: string, index: number) => {
            obj[header] = row[index];
            return obj;
          }, {});
        });
        setData(rows);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(filter.toLowerCase())
      )
    );
  }, [data, filter]);

  if (needsAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <button className="bg-blue-500 text-white p-4 rounded" onClick={handleGoogleSignIn}>
          Sign in with Google to View Data
        </button>
        {loginError && <p className="text-red-500 mt-2">{loginError}</p>}
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Production Dashboard</h1>
      
      <input
        className="border p-2 w-full mb-4"
        placeholder="Filter table..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      
      <div className="overflow-x-auto">
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Buyer</th>
              <th className="border p-2">PO</th>
              <th className="border p-2">STYLE</th>
              <th className="border p-2">ITEM</th>
              <th className="border p-2">DZN</th>
              <th className="border p-2">SHIP DATE</th>
              <th className="border p-2">Fabric Update</th>
              <th className="border p-2">Sewing Acc. Update</th>
              <th className="border p-2">Finishing Acc. Update</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <tr key={i} className="border-b">
                <td className="border p-2">{row['Buyer']}</td>
                <td className="border p-2">{row['PO']}</td>
                <td className="border p-2">{row['STYLE']}</td>
                <td className="border p-2">{row['ITEM']}</td>
                <td className="border p-2">{row['DZN']}</td>
                <td className="border p-2">{row['SHIP DATE']}</td>
                <td className="border p-2">{row['Fabric Update']}</td>
                <td className="border p-2">{row['Sewing Accessories Update']}</td>
                <td className="border p-2">{row['Finishing Accessories Update']}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
