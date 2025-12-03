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
        report += `✅ *CORRECT ANSWERS (${correctQuestions.length})*\n`;
        correctQuestions.forEach((result, index) => {
            report += `${result.questionNumber}. ${result.question}\n`;
            report += `   ✅ Student chose: ${result.userAnswer}\n`;
            report += `   💡 ${result.explanation}\n\n`;
        });
    }
    
    if (incorrectQuestions.length > 0) {
        report += `❌ *INCORRECT ANSWERS (${incorrectQuestions.length})*\n`;
        incorrectQuestions.forEach((result, index) => {
            report += `${result.questionNumber}. ${result.question}\n`;
            report += `   ❌ Student chose: ${result.userAnswer}\n`;
            report += `   ✅ Correct answer: ${result.correctAnswer}\n`;
            report += `   💡 ${result.explanation}\n\n`;
        });
    }
    
    if (unansweredQuestions.length > 0) {
        report += `⚠️ *UNANSWERED QUESTIONS (${unansweredQuestions.length})*\n`;
        unansweredQuestions.forEach((result, index) => {
            report += `${result.questionNumber}. ${result.question}\n`;
            report += `   ⚠️ Student did not answer\n`;
            report += `   ✅ Correct answer: ${result.correctAnswer}\n`;
            report += `   💡 ${result.explanation}\n\n`;
        });
    }
    
    report += `📋 *PERFORMANCE SUMMARY*\n`;
    report += `├─ ✅ Correct: ${correctQuestions.length}\n`;
    report += `├─ ❌ Incorrect: ${incorrectQuestions.length}\n`;
    if (unansweredQuestions.length > 0) {
        report += `├─ ⚠️ Unanswered: ${unansweredQuestions.length}\n`;
    }
    report += `├─ 📊 Accuracy: ${data.percentage}%\n`;
    report += `└─ ⏱️ Speed: ${Math.round(data.timeSpent / data.total)} seconds per question\n\n`;
    
    // Weak areas analysis
    const questionTypes = {
        'yet': [1, 10],
        'since': [2],
        'ever': [3, 9],
        'just': [4],
        'multiple times': [5],
        'present results': [6, 11, 15],
        'how long': [7],
        'for': [8],
        'recently': [13],
        'first time': [14],
        'question form': [12]
    };
    
    let weakAreas = [];
    for (const [type, questions] of Object.entries(questionTypes)) {
        const typeQuestions = data.detailedResults.filter(q => questions.includes(q.questionNumber));
        const incorrectType = typeQuestions.filter(q => !q.isCorrect || q.userAnswer === 'Not answered');
        if (incorrectType.length > 0) {
            weakAreas.push(type);
        }
    }
    
    if (weakAreas.length > 0) {
        report += `🎯 *AREAS NEEDING IMPROVEMENT*\n`;
        report += `Student struggled with:\n`;
        weakAreas.forEach(area => {
            report += `• ${area}\n`;
        });
        report += `\n`;
    }
    
    report += `📅 *Report generated:* ${data.timestamp}\n`;
    report += `_Automatic test reporting system_`;
    
    return report;
}

async function sendToTelegram(chatId, message) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('TELEGRAM_BOT_TOKEN is not set in environment variables');
        return false;
    }
    
    try {
        // Telegram has a 4096 character limit per message
        // Split long messages
        const maxLength = 4000;
        const messages = [];
        
        if (message.length > maxLength) {
            let start = 0;
            while (start < message.length) {
                let end = start + maxLength;
                if (end < message.length) {
                    // Try to break at a newline
                    const lastNewline = message.lastIndexOf('\n', end);
                    if (lastNewline > start + maxLength * 0.8) {
                        end = lastNewline;
                    }
                }
                messages.push(message.substring(start, end));
                start = end;
            }
        } else {
            messages.push(message);
        }
        
        // Send all parts
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        for (let i = 0; i < messages.length; i++) {
            const part = messages[i];
            const partText = messages.length > 1 ? 
                `*Part ${i + 1}/${messages.length}*\n\n${part}` : 
                part;
            
            const response = await axios.post(url, {
                chat_id: chatId,
                text: partText,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
            
            // Small delay between messages to avoid rate limiting
            if (i < messages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error sending Telegram message:', error.message);
        if (error.response) {
            console.error('Telegram API response:', error.response.data);
        }
        return false;
    }
}
