// D:\NEWs\news-aggregator\src\pages\TopNews.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

function TopNews() {
  const [topArticles, setTopArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    const fetchTopNews = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/articles/top');
        const articles = response.data.map((article) => ({
          ...article,
          id: article._id,
          likes: article.likes || 0,
          liked: user ? article.likedBy.includes(user.id) : false,
        }));
        setTopArticles(articles);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching top news:', error);
        setTopArticles([]);
        setLoading(false);
      }
    };
    fetchTopNews();
  }, [user]);

  const handleLike = async (id) => {
    if (!token) {
      alert('Please log in to like articles');
      return;
    }
    try {
      const response = await axios.post(
        `http://localhost:5000/api/articles/${id}/like`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTopArticles((prevArticles) =>
        prevArticles.map((article) =>
          article.id === id
            ? { ...article, likes: response.data.likes, liked: response.data.likedBy.includes(user.id) }
            : article
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleShare = (title, url) => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      `${title} - Check out this article on NewsHub! ${url}`
    )}`;
    window.open(twitterUrl, '_blank');
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-800 dark:text-gray-100">Loading top news...</div>;
  }

  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-6">Top News</h1>
      {topArticles.length === 0 ? (
        <p className="text-center text-gray-600 dark:text-gray-300">
          No top articles available yet. Like some articles to see them here!
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {topArticles.map((article) => (
            <div
              key={article.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl hover:scale-105 transition-all duration-300"
            >
              <img src={article.image} alt={article.title} className="w-full h-48 object-cover" />
              <div className="p-4">
                <Link to={`/article/${article.id}`}>
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200">
                    {article.title}
                  </h2>
                </Link>
                <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">
                  {article.fullText && article.fullText !== 'Unable to scrape full text'
                    ? article.fullText.slice(0, 120) + '...'
                    : 'No preview available'}
                </p>
                <div className="flex justify-between items-center space-x-2">
                  <button
                    onClick={() => handleLike(article.id)}
                    className="flex items-center transition-colors duration-200 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    {article.liked ? (
                      <svg
                        className="w-5 h-5 mr-1"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5 mr-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 8V20M4 8l6-4 4 4 6-4V20M4 20h16"
                        />
                      </svg>
                    )}
                    Like ({article.likes})
                  </button>
                  <button
                    onClick={() => handleShare(article.title, article.url)}
                    className="flex items-center text-blue-400 dark:text-blue-300 hover:text-blue-600 dark:hover:text-blue-200 transition-colors duration-200"
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

export default TopNews;