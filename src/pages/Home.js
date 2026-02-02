import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // Removed useNavigate since we won't redirect
import axios from 'axios';

function Home() {
  const [newsArticles, setNewsArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [loginMessage, setLoginMessage] = useState(''); // New state for login message
  const token = localStorage.getItem('token'); // Check if logged in
  const user = JSON.parse(localStorage.getItem('user')) || {}; // Get user ID if available
  const isLoggedIn = !!token;

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const url = searchTerm
          ? `http://localhost:5000/api/articles/search?q=${encodeURIComponent(searchTerm)}`
          : 'http://localhost:5000/api/articles';
        const response = await axios.get(url);
        const articles = Array.isArray(response.data)
          ? response.data.map((article) => ({
              ...article,
              id: article._id,
              likes: article.likes || 0,
            }))
          : [];
        setNewsArticles(articles);
      } catch (error) {
        console.error('Error fetching news:', error);
        setNewsArticles([]);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, [searchTerm]);

  const handleLike = async (id) => {
    if (!isLoggedIn) {
      // Show message instead of redirecting
      setLoginMessage('Please login to like articles');
      // Optionally clear the message after a few seconds
      setTimeout(() => setLoginMessage(''), 3000); // Clears after 3 seconds
      return;
    }

    try {
      const response = await axios.post(
        `http://localhost:5000/api/articles/${id}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } } // Include token for authenticated request
      );
      setNewsArticles((prevArticles) =>
        prevArticles.map((article) =>
          article.id === id
            ? {
                ...article,
                likes: response.data.likes,
                likedBy: response.data.likedBy, // Update likedBy to reflect toggle
              }
            : article
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error.response?.data || error);
    }
  };

  const handleShare = (title, url) => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${title} - Check out this article! ${url}`
    )}`;
    window.open(twitterUrl, '_blank');
  };

  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100">Latest News</h1>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search articles..."
          className="w-full sm:w-96 mt-4 sm:mt-0 p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      {/* Display login message if present */}
      {loginMessage && (
        <div className="text-center text-red-600 dark:text-red-400 mb-4">
          {loginMessage} <Link to="/login" className="underline hover:text-red-800 dark:hover:text-red-300">Login here</Link>
        </div>
      )}
      {loading ? (
        <div className="text-center text-gray-800 dark:text-gray-100 text-xl">Loading news...</div>
      ) : newsArticles.length === 0 ? (
        <p className="text-center text-gray-600 dark:text-gray-300">No articles found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {newsArticles.map((article) => (
            <div
              key={article.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-2xl transition-transform transform hover:-translate-y-2 flex flex-col h-full"
            >
              {article.image && (
                <img src={article.image} alt={article.title} className="w-full h-48 object-cover" />
              )}
              <div className="p-5 flex flex-col flex-grow">
                <Link to={`/article/${article.id}`}>
                  <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    {article.title}
                  </h2>
                </Link>
                <p className="text-gray-600 dark:text-gray-300 mb-4 flex-grow">
                  {article.fullText?.slice(0, 120) || 'No preview available'}...
                </p>
                <div className="flex justify-between items-center mt-auto">
                  <button
                    onClick={() => handleLike(article.id)}
                    className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    <svg
                      className="w-5 h-5 mr-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    {article.likes} {isLoggedIn && article.likedBy?.includes(user.id) ? 'Unlike' : 'Like'}
                  </button>
                  <button
                    onClick={() => handleShare(article.title, article.url)}
                    className="flex items-center text-blue-400 dark:text-blue-300 hover:text-blue-600 dark:hover:text-blue-200"
                  >
                    <svg
                      className="w-5 h-5 mr-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
                    </svg>
                    Share
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;