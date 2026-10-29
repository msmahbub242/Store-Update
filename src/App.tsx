import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';

// Define the tabs with their specific buyer/sheet links
const TABS = [
  { name: 'LCW Tarek', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=657204573&single=true&output=csv' },
  { name: 'LCW Rausan', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=2147335208&single=true&output=csv' },

  // Add more tabs/buyers here with their respective CSV links
];

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(TABS[0].name);
  const [filter, setFilter] = useState('');

  const fetchCsvData = async (link: string) => {
    try {
      const response = await fetch(link);
      const csvText = await response.text();
      Papa.parse(csvText, {
        header: true,
        complete: (results) => {
          setData(results.data);
        },
        error: (error) => console.error('CSV Parsing error:', error)
      });
    } catch (err) {
      console.error('Error fetching CSV:', err);
    }
  };

  useEffect(() => {
    const tab = TABS.find(t => t.name === activeTab);
    if (tab) fetchCsvData(tab.link);
  }, [activeTab]);

  const filteredData = useMemo(() => {
    return data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(filter.toLowerCase())
      )
    );
  }, [data, filter]);

  // ... (inside component)
  const columnsToDisplay = ["File No", "Buyer", "PO", "STYLE", "ITEM", "DZN", "SHIP DATE", "Fabric Update", "Sewing Accessories Update", "Finishing Accessories Update", "Remark"];

  const getStatusColor = (val: string) => {
    return val?.toLowerCase().trim() === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Production Dashboard</h1>
      
      {/* Tab Switcher */}
      <div className="flex space-x-2 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.name}
            className={`px-5 py-2.5 rounded-lg font-semibold transition ${activeTab === tab.name ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            onClick={() => setActiveTab(tab.name)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <input
        className="w-full p-3 mb-6 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder="Search..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                {columnsToDisplay.map((col) => (
                  <th key={col} className="p-4 font-bold">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredData.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  {columnsToDisplay.map((col) => {
                    const val = row[col];
                    const isStatusCol = col.includes('Update');
                    return (
                      <td key={col} className={`p-4 ${isStatusCol ? getStatusColor(val) : 'text-gray-900'}`}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

}
