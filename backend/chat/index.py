"""
Business: Global chat - send messages, get messages, count online users
Args: event - dict with httpMethod, body (message, userId, username), queryStringParameters
      context - object with attributes: request_id, function_name
Returns: HTTP response with messages list, online count or success status
"""
import json
import os
from typing import Dict, Any
from datetime import datetime, timedelta
import psycopg2

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method: str = event.get('httpMethod', 'GET')
    
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
        
        cur.execute(
            "SELECT id, username, message, created_at FROM messages ORDER BY created_at DESC LIMIT 50"
        )
        messages = []
        for row in cur.fetchall():
            messages.append({
                'id': row[0],
                'username': row[1],
                'message': row[2],
                'timestamp': row[3].isoformat()
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
        user_id = body_data.get('userId')
        username = body_data.get('username', 'Anonymous')
        message = body_data.get('message', '').strip()
        
        if not message:
            cur.close()
            conn.close()
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'error': 'Message cannot be empty'}),
                'isBase64Encoded': False
            }
        
        cur.execute(
            "INSERT INTO messages (user_id, username, message) VALUES (%s, %s, %s) RETURNING id, created_at",
            (user_id, username, message)
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
                'timestamp': created_at.isoformat()
            }),
            'isBase64Encoded': False
        }
    
    return {
        'statusCode': 405,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'error': 'Method not allowed'}),
        'isBase64Encoded': False
    }
