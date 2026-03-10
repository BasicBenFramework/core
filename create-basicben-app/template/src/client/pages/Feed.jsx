import { useState, useEffect } from 'react'
import { PageHeader, PostCard, Loading, Empty } from '../components'
import { api } from '../api'

export function Feed({ navigate }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/api/feed').then(data => setPosts(data.posts)).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  return (
    <div>
      <PageHeader title="Feed" />
      {posts.length === 0 ? (
        <Empty>No posts yet</Empty>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard key={post.id} post={post} onClick={() => navigate('feedPost', post.id)} showAuthor />
          ))}
        </div>
      )}
    </div>
  )
}
