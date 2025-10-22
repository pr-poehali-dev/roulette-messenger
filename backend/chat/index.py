"""
Business: Global chat - send/get messages, reports, hide messages, auto-cleanup, media support
Args: event - dict with httpMethod, body, queryStringParameters
      context - object with attributes: request_id, function_name
Returns: HTTP response with messages list, online count or success status
"""
import json
import os
import re
from typing import Dict, Any
from datetime import datetime, timedelta
import psycopg2

PROFANITY_PATTERNS = [
    r'\b(sex|porn|xxx|fuck|shit|bitch|dick|cock|pussy|ass|nude)\b',
]

def contains_profanity(text: str) -> bool:
    text_lower = text.lower()
    for pattern in PROFANITY_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method: str = event.get('httpMethod', 'GET')
    
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            'body': ''
        }
    
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    
    if method == 'GET':
        query_params = event.get('queryStringParameters', {}) or {}
        action = query_params.get('action', 'messages')
        
        if action == 'online':
            threshold = datetime.now() - timedelta(minutes=5)
            cur.execute(
                "SELECT COUNT(*) FROM users WHERE last_seen > %s",
                (threshold,)
            )
            online_count = cur.fetchone()[0]
            cur.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'online': online_count}),
                'isBase64Encoded': False
            }
        
        cleanup_threshold = datetime.now() - timedelta(hours=24)
        cur.execute(
            "UPDATE messages SET is_hidden = true WHERE created_at < %s AND is_hidden = false",
            (cleanup_threshold,)
        )
        conn.commit()
        
        cur.execute(
            """
            SELECT m.id, m.username, m.message, m.created_at, m.message_type, 
                   m.media_url, m.user_id, COUNT(r.id) as report_count
            FROM messages m
            LEFT JOIN reports r ON m.id = r.message_id
            WHERE m.is_hidden = false
            GROUP BY m.id
            ORDER BY m.created_at DESC 
            LIMIT 100
            """
        )
        messages = []
        for row in cur.fetchall():
            report_count = row[7]
            if report_count >= 3:
                cur.execute("UPDATE messages SET is_hidden = true WHERE id = %s", (row[0],))
                conn.commit()
                continue
                
            messages.append({
                'id': row[0],
                'username': row[1],
                'message': row[2],
                'timestamp': row[3].isoformat(),
                'messageType': row[4] or 'text',
                'mediaUrl': row[5],
                'userId': row[6]
            })
        
        cur.close()
        conn.close()
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'messages': list(reversed(messages))}),
            'isBase64Encoded': False
        }
    
    if method == 'POST':
        body_data = json.loads(event.get('body', '{}'))
        action = body_data.get('action', 'send')
        
        if action == 'report':
            message_id = body_data.get('messageId')
            reported_by = body_data.get('userId')
            reason = body_data.get('reason', '')
            
            if not message_id or not reported_by:
                cur.close()
                conn.close()
                return {
                    'statusCode': 400,
                    'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Invalid report data'}),
                    'isBase64Encoded': False
                }
            
            cur.execute(
                "INSERT INTO reports (message_id, reported_by, reason, created_at) VALUES (%s, %s, %s, CURRENT_TIMESTAMP)",
                (message_id, reported_by, reason)
            )
            conn.commit()
            cur.close()
            conn.close()
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'success': True}),
                'isBase64Encoded': False
            }
        
        user_id = body_data.get('userId')
        username = body_data.get('username', 'Anonymous')
        message = body_data.get('message', '').strip()
        message_type = body_data.get('messageType', 'text')
        media_url = body_data.get('mediaUrl')
        
        if not message and not media_url:
            cur.close()
            conn.close()
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Message or media required'}),
                'isBase64Encoded': False
            }
        
        if message and contains_profanity(message):
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Message contains inappropriate content'}),
                'isBase64Encoded': False
            }
        
        cur.execute(
            """
            INSERT INTO messages (user_id, username, message, message_type, media_url, is_hidden, created_at) 
            VALUES (%s, %s, %s, %s, %s, false, CURRENT_TIMESTAMP) 
            RETURNING id, created_at
            """,
            (user_id, username, message or '', message_type, media_url)
        )
        conn.commit()
        msg_id, created_at = cur.fetchone()
        
        if user_id:
            cur.execute("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = %s", (user_id,))
            conn.commit()
        
        cur.close()
        conn.close()
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'id': msg_id,
                'username': username,
                'message': message,
                'messageType': message_type,
                'mediaUrl': media_url,
                'timestamp': created_at.isoformat()
            }),
            'isBase64Encoded': False
        }
    
    if method == 'PUT':
        body_data = json.loads(event.get('body', '{}'))
        message_id = body_data.get('messageId')
        user_id = body_data.get('userId')
        
        if not message_id or not user_id:
            cur.close()
            conn.close()
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Invalid data'}),
                'isBase64Encoded': False
            }
        
        cur.execute(
            "UPDATE messages SET is_hidden = true WHERE id = %s AND user_id = %s",
            (message_id, user_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'success': True}),
            'isBase64Encoded': False
        }
    
    return {
        'statusCode': 405,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'error': 'Method not allowed'}),
        'isBase64Encoded': False
    }
