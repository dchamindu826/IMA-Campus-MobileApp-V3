import React, { createContext, useState } from 'react';
import api from '../services/api';

export const CourseContext = createContext();

export const CourseProvider = ({ children }) => {
    const [courseDetails, setCourseDetails] = useState(null);
    const [loadingContent, setLoadingContent] = useState(false);

    // Backend එකේ viewModule (StudentController) එකට call කරන function එක
    const fetchCourseContent = async (courseId) => {
        try {
            setLoadingContent(true);
            const response = await api.get(`/viewModule/${courseId}`);
            // Laravel එකෙන් එවන data (liveClasses, recordings, documents etc.) මෙතන save වෙනවා
            setCourseDetails(response.data); 
        } catch (error) {
            console.error("Error fetching course content:", error);
        } finally {
            setLoadingContent(false);
        }
    };

    return (
        <CourseContext.Provider value={{ courseDetails, fetchCourseContent, loadingContent }}>
            {children}
        </CourseContext.Provider>
    );
};