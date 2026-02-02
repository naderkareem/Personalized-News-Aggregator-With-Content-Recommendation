import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [trends, setTrends] = useState({});
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    const fetchData = async () => {
      try {
        const [usersRes, trendsRes] = await Promise.all([
          axios.get('http://localhost:5000/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('http://localhost:5000/api/admin/trends', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setUsers(usersRes.data);
        setTrends(trendsRes.data);
      } catch (error) {
        console.error('Error fetching admin data:', error);
        if (error.response?.status === 403) navigate('/login');
      }
    };
    fetchData();
  }, [token, navigate]);

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Delete this user?')) {
      try {
        await axios.delete(`http://localhost:5000/api/admin/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsers(users.filter(u => u._id !== userId));
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Users</h2>
        <table className="w-full bg-white shadow-md rounded">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Likes</th>
              <th className="p-2">Shares</th>
              <th className="p-2">Comments</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user._id}>
                <td className="p-2">{user.name}</td>
                <td className="p-2">{user.email}</td>
                <td className="p-2">{user.likes}</td>
                <td className="p-2">{user.shares}</td>
                <td className="p-2">{user.comments}</td>
                <td className="p-2">
                  <button
                    onClick={() => handleDeleteUser(user._id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Article Trends</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 shadow-md rounded">
            <h3 className="text-xl mb-2">Top Liked Articles</h3>
            <ul>
              {trends.topLiked?.map(article => (
                <li key={article._id}>{article.title} ({article.likes} likes)</li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-4 shadow-md rounded">
            <h3 className="text-xl mb-2">Category Breakdown</h3>
            <ul>
              {trends.categoryBreakdown?.map(cat => (
                <li key={cat._id}>{cat._id}: {cat.count} articles</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdminPanel;