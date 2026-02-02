import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import ArticleDetail from './pages/ArticleDetail';
import TopNews from './pages/TopNews';
import Categories from './pages/Categories';
import MyNews from './pages/MyNews';
import AdminPanel from './pages/AdminPanel';
import Profile from './pages/Profile'; // Add this import

const About = () => <div className="p-4 dark:bg-gray-900 dark:text-gray-100">About Page</div>;

function App() {
  return (
    <Router>
      <div className="bg-gray-100 dark:bg-gray-900 min-h-screen">
        <Navbar />
        <div className="container mx-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/TopNews" element={<TopNews />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/login" element={<Login />} />
            <Route path="/MyNews" element={<MyNews />} />
            <Route path="/article/:id" element={<ArticleDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/profile" element={<Profile />} /> {/* Add this route */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;