import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

const MyNews = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchMyNews = async () => {
    try {
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user'));
      if (!token || !user) {
        throw new Error('Please log in to view personalized news');
      }

      setLoading(true);
      const response = await axios.get(`http://localhost:5000/api/MyNews?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Fetched MyNews:', response.data.map(a => ({ title: a.title, category: a.category })));
      if (!Array.isArray(response.data)) {
        throw new Error('Expected an array from /api/MyNews');
      }
      setArticles(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Fetch error:', err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || err.message);
      setArticles([]);
      setLoading(false);
      if (err.message.includes('log in')) {
        navigate('/login');
      }
    }
  };

  const resetPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please log in to reset preferences');
      }

      setLoading(true);
      const response = await axios.post(
        'http://localhost:5000/api/mynews/reset',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Reset response:', response.data.map(a => ({ title: a.title, category: a.category })));
      setArticles(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Reset error:', err.response ? err.response.data : err.message);
      setError(err.response?.data?.message || err.message);
      setArticles([]);
      setLoading(false);
      if (err.message.includes('log in')) {
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    fetchMyNews();
  }, [navigate]);

  if (loading) {
    return (
      <div className="text-center mt-10 text-lg font-semibold text-gray-700 dark:text-gray-300">
        Loading your personalized news...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center mt-10 text-red-500 text-lg font-semibold">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4 text-center">
        My Personalized News
      </h1>
      <div className="text-center mb-8">
        <button
          onClick={resetPreferences}
          className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition duration-200"
        >
          Reset Preferences
        </button>
      </div>
      {articles.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400 text-center text-lg">
          No personalized articles yet. Start liking, sharing, or reading news to see recommendations!
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <div
              key={article._id}
              className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden transition transform hover:scale-105 hover:shadow-xl"
            >
              {article.image && (
                <img
                  src={article.image}
                  alt={article.title}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-5">
                <Link to={`/article/${article._id}`}>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate hover:text-indigo-600 dark:hover:text-indigo-400">
                    {article.title}
                  </h2>
                </Link>
                <p className="text-gray-600 dark:text-gray-400 mt-2">{article.category}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyNews;