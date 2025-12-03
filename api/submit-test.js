const axios = require('axios');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request for CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const data = req.body;
        
        // Validate required field
        if (!data.name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name is required' 
            });
        }
        
        // Get IP address (for teacher's information)
        const ipAddress = req.headers['x-forwarded-for'] || 
                         req.headers['x-real-ip'] || 
                         req.connection.remoteAddress;
        
        data.ipAddress = ipAddress;
        
        // Get environment variables
        const TEACHER_CHAT_ID = process.env.TELEGRAM_TEACHER_CHAT_ID;
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        
        if (!TEACHER_CHAT_ID || !TELEGRAM_BOT_TOKEN) {
            console.error('Missing environment variables');
            return res.status(500).json({ 
                success: false, 
                error: 'Server configuration error' 
            });
        }
        
        // Prepare detailed report for Teacher
        const report = generateTeacherReport(data);
        
        // Send report to Teacher's Telegram
        const telegramSent = await sendToTelegram(TEACHER_CHAT_ID, report);
        
        if (!telegramSent) {
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to send report to teacher' 
            });
        }
        
        // Log the submission
        console.log('Test submitted by student:', {
            name: data.name,
            score: `${data.score}/${data.total}`,
            percentage: data.percentage,
            timeSpent: `${Math.floor(data.timeSpent / 60)}m ${data.timeSpent % 60}s`,
            timestamp: new Date().toISOString(),
            ip: ipAddress
        });
        
        return res.status(200).json({ 
            success: true, 
            message: 'Test submitted successfully. Your teacher has received your results.',
            studentData: {
                name: data.name,
                score: data.score,
                total: data.total,
                percentage: data.percentage,
                timeSpent: data.timeSpent
            }
        });
        
    } catch (error) {
        console.error('Error submitting test:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal server error. Please try again.' 
        });
    }
};

function generateTeacherReport(data) {
    const scoreEmoji = data.percentage >= 90 ? '🏆 EXCELLENT' : 
                      data.percentage >= 75 ? '👍 VERY GOOD' : 
                      data.percentage >= 60 ? '✅ GOOD' : 
                      data.percentage >= 50 ? '📝 SATISFACTORY' : 
                      '📚 NEEDS IMPROVEMENT';
    
    const timeSpent = `${Math.floor(data.timeSpent / 60)} minutes ${data.timeSpent % 60} seconds`;
    const completionTime = new Date(data.startTime).toLocaleTimeString();
    const submissionTime = new Date(data.endTime).toLocaleTimeString();
    
    const grade = data.percentage >= 90 ? 'A+' :
                  data.percentage >= 85 ? 'A' :
                  data.percentage >= 80 ? 'A-' :
                  data.percentage >= 75 ? 'B+' :
                  data.percentage >= 70 ? 'B' :
                  data.percentage >= 65 ? 'B-' :
                  data.percentage >= 60 ? 'C+' :
                  data.percentage >= 55 ? 'C' :
                  data.percentage >= 50 ? 'C-' :
                  data.percentage >= 45 ? 'D+' :
                  data.percentage >= 40 ? 'D' : 'F';
    
    let report = `👨‍🏫 *NEW TEST SUBMISSION - TEACHER REPORT* 👨‍🏫\n\n`;
    report += `📋 *STUDENT INFORMATION*\n`;
    report += `├─ 👤 *Name:* ${data.name}\n`;
    report += `├─ 🌐 *IP Address:* ${data.ipAddress || 'Not available'}\n`;
    report += `├─ 🕐 *Started:* ${completionTime}\n`;
    report += `└─ 🕐 *Submitted:* ${submissionTime}\n\n`;
    
    report += `📊 *TEST RESULTS*\n`;
    report += `├─ 🎯 *Score:* ${data.score}/${data.total}\n`;
    report += `├─ 📈 *Percentage:* ${data.percentage}%\n`;
    report += `├─ ⏱️ *Time Taken:* ${timeSpent}\n`;
    report += `├─ 📝 *Grade:* ${grade}\n`;
    report += `└─ ${scoreEmoji}\n\n`;
    
    report += `📝 *QUESTION-BY-QUESTION ANALYSIS*\n\n`;
    
    // Group by correct/incorrect
    const correctQuestions = data.detailedResults.filter(q => q.isCorrect);
    const incorrectQuestions = data.detailedResults.filter(q => !q.isCorrect);
    const unansweredQuestions = data.detailedResults.filter(q => q.userAnswer === 'Not answered');
    
    if (correctQuestions.length > 0) {
        report
